import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { executeRpc } from 'src/common/utils/rpc-handler';
import { OrdersService, type OrderCreator } from './orders.service';
import {
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES,
} from 'src/common/rabbitMQ/rabbitmq-topology';
import { AddOrderItemsDto } from './dto/add-item.dto';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersRPCController {
  constructor(private readonly ordersService: OrdersService) {}

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.GET_ORDER_PERIOD_STATISTICS, queue: QUEUES.ORDERS_COMMANDS })
  getPeriodStatistics(payload: { days?: number; date?: string }) {
    return executeRpc(() => this.ordersService.getPeriodStatistics(payload.days, payload.date));
  }

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.RESET_ORDER_DATA, queue: QUEUES.ORDERS_COMMANDS })
  reset(payload: { confirmation: string }) {
    return executeRpc(() => this.ordersService.resetBusinessData(payload.confirmation));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CREATE_ORDER,
    queue: QUEUES.ORDERS_COMMANDS,
  })
  create(payload: { dto: CreateOrderDto; creator?: OrderCreator }) {
    return executeRpc(() => this.ordersService.create(payload.dto, payload.creator));
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
    routingKey: ROUTING_KEYS.GET_ORDERS_TODAY_STATISTICS,
    queue: QUEUES.ORDERS_COMMANDS,
  })
  getTodayStatistics() {
    return executeRpc(() => this.ordersService.getTodayStatistics());
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

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CHANGE_ORDER_STATUS,
    queue: QUEUES.ORDERS_COMMANDS,
  })
  changeStatus(payload: { id: number; status: 'completed' | 'rejected' }) {
    return executeRpc(() => this.ordersService.changeStatus(payload));
  }
}
