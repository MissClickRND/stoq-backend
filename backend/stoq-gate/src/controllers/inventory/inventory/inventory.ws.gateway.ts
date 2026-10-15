import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Logger } from '@nestjs/common';
import { InventoryResponseDto, ProductResponseDto } from '../../../common/dto/business-response.dto';
import { ApiTags, ApiExtraModels } from '@nestjs/swagger';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';
import {
  WsSuccessResponseDto,
  WsErrorResponseDto,
  GetStockRequestDto,
  GetExpiringSoonRequestDto,
  StockChangedEvent,
  BatchExpiredEvent,
  InventoryNotification,
  StockChangedNotificationEvent,
  BatchExpiredNotificationEvent,
} from './dto/inventory-ws.dto';

@ApiTags('Inventory WebSocket')
@ApiExtraModels(WsSuccessResponseDto, WsErrorResponseDto)
@WebSocketGateway({
  namespace: '/inventory',
  cors: {
    origin: '*',
  },
})
export class InventoryWsGateway {
  private readonly logger = new Logger(InventoryWsGateway.name);
  private stockBroadcastQueue: Promise<void> = Promise.resolve();
  @WebSocketServer()
  server!: Server;

  constructor(private readonly commandBusService: CommandBusService) {}

  private validatePayload<T extends object>(type: ClassConstructor<T>, payload: unknown): T {
    if (payload != null && (typeof payload !== 'object' || Array.isArray(payload))) {
      throw new Error('Ожидается объект запроса');
    }
    const dto = plainToInstance(type, payload ?? {});
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) {
      throw new Error(errors.flatMap((error) => Object.values(error.constraints ?? {})).join('; '));
    }
    return dto;
  }

  private getRequestId(payload: unknown): string {
    const requestId = (payload as { requestId?: unknown } | null)?.requestId;
    return typeof requestId === 'string' && requestId.length <= 128 ? requestId : randomUUID();
  }

  private handleRpcResponse<T>(response: any): T {
    if (!response || !response.success) {
      throw new Error(response?.error?.message ?? 'RPC error');
    }
    return response.data as T;
  }

  @SubscribeMessage('inventory:getStock')
  async getStock(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ) {
    const requestId = this.getRequestId(payload);

    try {
      const dto = this.validatePayload(GetStockRequestDto, payload);
      const response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_INVENTORY_STOCK,
        { productIds: dto.productIds },
      );

      const data = this.handleRpcResponse(response);

      client.emit('inventory:stockResult', {
        requestId,
        data,
      });
    } catch (err) {
      client.emit('inventory:error', {
        requestId,
        message: err instanceof Error ? err.message : 'Неизвестная ошибка',
      });
    }
  }

  @SubscribeMessage('inventory:getExpiringSoon')
  async getExpiringSoon(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ) {
    const requestId = this.getRequestId(payload);

    try {
      const dto = this.validatePayload(GetExpiringSoonRequestDto, payload);
      const response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_EXPIRING_INVENTORY,
        { daysThreshold: dto.daysThreshold ?? 7 },
      );

      const data = this.handleRpcResponse(response);

      client.emit('inventory:expiringSoonResult', {
        requestId,
        data,
      });
    } catch (err) {
      client.emit('inventory:error', {
        requestId,
        message: err instanceof Error ? err.message : 'Неизвестная ошибка',
      });
    }
  }

  broadcastStockChanged(payload: StockChangedEvent) {
    // Serialize snapshot requests so a slower earlier request cannot overwrite a later one.
    const broadcast = this.stockBroadcastQueue.then(() => this.sendStockChanged(payload));
    this.stockBroadcastQueue = broadcast.catch(() => {});
    return broadcast;
  }

  private async sendStockChanged(payload: StockChangedEvent): Promise<void> {
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.GET_INVENTORY, { search: undefined },
    );
    const data = this.handleRpcResponse<InventoryResponseDto[]>(response);
    if (!Array.isArray(data)) throw new Error('Некорректный ответ GET /inventory');

    const productIds = [...new Set([
      ...(payload.productIds ?? []),
      ...data.filter((batch) => payload.batchIds?.includes(batch.id) ||
        (payload.supplyId !== undefined && batch.supplyId === payload.supplyId))
        .map((batch) => batch.productId),
    ])];
    const products = await this.getNotificationProducts(productIds, data);
    const descriptions: Record<string, string> = {
      SUPPLY_CREATED: 'Добавлена поставка',
      SUPPLY_UPDATED: 'Изменена поставка',
      MANUAL_UPDATE: 'Остаток изменён вручную',
      MANUAL_WRITE_OFF: 'Остаток списан вручную',
      ORDER_DEDUCTION: 'Продукт израсходован по заказу',
      EXPIRATION_WRITE_OFF: 'Истёк срок годности партии, остаток списан',
      BUSINESS_RESET: 'Данные склада сброшены',
    };
    const problem = descriptions[payload.reason] ?? 'Склад обновлён';
    const severity = payload.reason === 'EXPIRATION_WRITE_OFF' ? 'warning' : 'info';
    const notifications: InventoryNotification[] = productIds.length
      ? productIds.map((productId) => {
        const productName = products.get(productId)?.name ?? `Продукт #${productId}`;
        return { productId, productName, problem, message: `${productName}: ${problem}.`, severity };
      })
      : [{ productId: null, productName: null, problem, message: `${problem}.`, severity }];
    const event: StockChangedNotificationEvent = {
      ...payload, data, problem,
      message: notifications.map((notification) => notification.message).join(' '), notifications,
    };
    this.server.emit('inventory:stockChanged', event);
  }

  async broadcastBatchExpired(payload: BatchExpiredEvent): Promise<void> {
    // Expired batches are absent from GET /inventory; resolve their names from the catalog.
    const products = await this.getNotificationProducts([payload.productId]);
    const product = products.get(payload.productId) ?? null;
    const productName = product?.name ?? `Продукт #${payload.productId}`;
    const unit = product?.unit?.shortName ? ` ${product.unit.shortName}` : '';
    const problem = 'Истёк срок годности';
    const event: BatchExpiredNotificationEvent = {
      ...payload, product, productName, problem, severity: 'warning',
      message: `${productName}: истёк срок годности партии №${payload.batchId}. Списано ${payload.lostQuantity}${unit}.`,
    };
    this.server.emit('inventory:batchExpired', event);
  }

  private async getNotificationProducts(productIds: number[], inventory: InventoryResponseDto[] = []) {
    const products = new Map<number, ProductResponseDto>();
    for (const batch of inventory) {
      if (batch.product?.name) products.set(batch.productId, batch.product);
    }
    const missingIds = productIds.filter((id) => !products.has(id));
    if (missingIds.length) {
      try {
        const response = await this.commandBusService.sendCommand(
          EXCHANGES.COMMANDS, ROUTING_KEYS.GET_PRODUCT, { ids: missingIds },
        );
        const result = this.handleRpcResponse<ProductResponseDto[]>(response);
        if (!Array.isArray(result)) throw new Error('Некорректный ответ каталога');
        for (const product of result) {
          if (product?.name) products.set(product.id, product);
        }
      } catch {
        // Keep the notification usable even when a product was deleted or the catalog is down.
        this.logger.warn(`Не удалось получить названия продуктов: ${missingIds.join(', ')}`);
      }
    }
    return products;
  }
}
