import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { EXCHANGES, QUEUES, ROUTING_KEYS } from "src/common/rabbitMQ/rabbitmq-topology";
import { executeRpc } from "src/common/utils/rpc-handler";
import { DishesService } from "./dishes.service";
import { CreateDishDto } from "./dto/create-dish.dto";

@Injectable()
export class DishesRPCController {
  constructor(private readonly dishesService: DishesService) {}

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CREATE_DISHES,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  create(payload: { dto: CreateDishDto }) {
    return executeRpc(() => this.dishesService.create(payload.dto));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DISHES,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findAll() {
    return executeRpc(() => this.dishesService.findAll());
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DISHES_BY_ID,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findOne(payload: { id: number }) {
    return executeRpc(() => this.dishesService.findOne(payload.id));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.DEL_DISHES_BY_ID,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  remove(payload: { id: number }) {
    return executeRpc(() => this.dishesService.remove(payload.id));
  }
}
