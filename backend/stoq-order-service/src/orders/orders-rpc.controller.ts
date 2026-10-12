import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { EXCHANGES, QUEUES, ROUTING_KEYS } from "src/common/rabbitmq-topology";
import { executeRpc } from "src/common/utils/rpc-handler";
import { OrdersService } from "./orders.service";

@Injectable()
export class OrdersRPCController {
  constructor(private readonly ordersService: OrdersService) {}

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CREATE_DISHES,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  create() {
    return executeRpc(() => this.ordersService.create());
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DISHES,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findAll() {
    return executeRpc(() => this.ordersService.findAll());
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DISHES_BY_ID,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findOne(payload: { id: number }) {
    return executeRpc(() => this.ordersService.findOne(payload.id));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.DEL_DISHES_BY_ID,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  remove(payload: { id: number }) {
    return executeRpc(() => this.ordersService.remove(payload.id));
  }
}
