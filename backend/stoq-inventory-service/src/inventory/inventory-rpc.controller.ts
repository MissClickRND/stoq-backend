import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import {
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES,
} from "../common/rabbitMQ/rabbitmq-topology";
import { executeRpc } from "../common/utils/rpc-handler";
import { InventoryService } from "./inventory.service";
import { UpdateQuantityDto } from "./dto/request/update-quantity.dto";
import {
  DeductStockDto,
  DeductStockItemDto,
} from "./dto/request/deduct-stock.dto";

@Injectable()
export class InventoryRPCController {
  constructor(private readonly inventoryService: InventoryService) {}

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.GET_INVENTORY_STATISTICS, queue: QUEUES.INVENTORY_COMMANDS })
  statistics() {
    return executeRpc(() => this.inventoryService.getStatistics());
  }

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.GET_INVENTORY_WRITE_OFFS, queue: QUEUES.INVENTORY_COMMANDS })
  writeOffs() {
    return executeRpc(() => this.inventoryService.getWriteOffs());
  }

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.PREVIEW_INVENTORY, queue: QUEUES.INVENTORY_COMMANDS })
  preview(payload: { dto: UpdateQuantityDto }) {
    return executeRpc(() => this.inventoryService.preview(payload.dto));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_INVENTORY_STOCK,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  getStock(payload: { productIds: number[] }) {
    return executeRpc(() => this.inventoryService.getStock(payload.productIds));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_INVENTORY,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  async findAll(payload: { search?: string }) {
    return executeRpc(() => this.inventoryService.findAll(payload.search));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_INVENTORY_BY_ID,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  async findOne(payload: { productId: number }) {
    return executeRpc(() => this.inventoryService.findOne(payload.productId));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.UPDATE_QUANTITY_INVENTORY,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  updateQuantity(payload: { dto: UpdateQuantityDto; operation?: 'WRITE_OFF' }) {
    if (payload.operation === 'WRITE_OFF') {
      return executeRpc(() => this.inventoryService.writeOffBatch(payload.dto.items[0]?.batchId));
    }
    return executeRpc(() => this.inventoryService.updateQuantity(payload.dto));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_EXPIRING_INVENTORY,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  expiring(payload: { daysThreshold: number }) {
    return executeRpc(() =>
      this.inventoryService.getExpiringSoonBatches(payload.daysThreshold),
    );
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.DEDUCT_STOCK_INVENTORY,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  deductStock(payload: { dto: DeductStockDto }) {
    return executeRpc(() => this.inventoryService.deductStock(payload.dto));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CHECK_STOCK_INVENTORY,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  checkStockAvailability(payload: { dto: DeductStockItemDto[] }) {
    return executeRpc(() =>
      this.inventoryService.checkStockAvailability(payload.dto),
    );
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.EXPIRE_INVENTORY,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  expire() {
    return executeRpc(() => this.inventoryService.processJustExpiredBatches());
  }
}
