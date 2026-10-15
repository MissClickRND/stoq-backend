import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { ApiTags, ApiExtraModels } from '@nestjs/swagger';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';
import {
  WsSuccessResponseDto,
  WsErrorResponseDto,
  GetStockRequestDto,
  GetExpiringSoonRequestDto,
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
  @WebSocketServer()
  server!: Server;

  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response || !response.success) {
      throw new Error(response?.error?.message ?? 'RPC error');
    }
    return response.data as T;
  }

  @SubscribeMessage('inventory:getStock')
  async getStock(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GetStockRequestDto,
  ) {
    const requestId = payload.requestId ?? randomUUID();

    try {
      const response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_INVENTORY_STOCK,
        { productIds: payload.productIds },
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
    @MessageBody() payload: GetExpiringSoonRequestDto,
  ) {
    const requestId = payload.requestId ?? randomUUID();

    try {
      const response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_EXPIRING_INVENTORY,
        { daysThreshold: payload.daysThreshold ?? 7 },
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

  broadcastStockChanged(payload: any) {
    this.server.emit('inventory:stockChanged', payload);
  }

  broadcastBatchExpired(payload: any) {
    this.server.emit('inventory:batchExpired', payload);
  }
}
