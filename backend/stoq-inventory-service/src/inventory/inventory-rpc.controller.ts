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

@Injectable()
export class InventoryRPCController {
  constructor(private readonly inventoryService: InventoryService) {}

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
  updateQuantity(payload: { dto: UpdateQuantityDto }) {
    return executeRpc(() => this.inventoryService.updateQuantity(payload.dto));
  }
}
