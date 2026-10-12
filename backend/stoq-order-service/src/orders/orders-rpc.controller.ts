import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { executeRpc } from 'src/common/utils/rpc-handler';
import { OrdersService } from './orders.service';
import {
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES,
} from 'src/common/rabbitMQ/rabbitmq-topology';
import { AddOrderItemsDto } from './dto/add-item.dto';

@Injectable()
export class OrdersRPCController {
  constructor(private readonly ordersService: OrdersService) {}

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CREATE_ORDER,
    queue: QUEUES.ORDERS_COMMANDS,
  })
  create() {
    return executeRpc(() => this.ordersService.create());
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_ORDER,
    queue: QUEUES.ORDERS_COMMANDS,
  })
  findAll() {
    return executeRpc(() => this.ordersService.findAll());
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_ORDER_BY_ID,
    queue: QUEUES.ORDERS_COMMANDS,
  })
  findOne(payload: { id: number }) {
    return executeRpc(() => this.ordersService.findOne(payload.id));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.ADD_DISH_TO_ORDER,
    queue: QUEUES.ORDERS_COMMANDS,
  })
  addItems(payload: { id: number; dto: AddOrderItemsDto }) {
    return executeRpc(() =>
      this.ordersService.addItems({
        orderId: payload.id,
        dto: payload.dto,
      }),
    );
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.DEL_ORDER_BY_ID,
    queue: QUEUES.ORDERS_COMMANDS,
  })
  remove(payload: { id: number }) {
    return executeRpc(() => this.ordersService.remove(payload.id));
  }
}
