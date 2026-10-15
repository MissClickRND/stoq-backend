import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { InventoryWsGateway } from './inventory.ws.gateway';
import { EXCHANGES, ROUTING_KEYS, QUEUES } from 'src/common/rabbitMQ/rabbitmq-topology';

@Injectable()
export class InventoryEventsListener {
  constructor(private readonly wsGateway: InventoryWsGateway) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.STOCK_CHANGED,
    queue: QUEUES.GATEWAY_EVENTS,
  })
  onStockChanged(payload: any) {
    this.wsGateway.broadcastStockChanged(payload);
  }

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.BATCH_EXPIRED,
    queue: QUEUES.GATEWAY_EVENTS,
  })
  onBatchExpired(payload: any) {
    this.wsGateway.broadcastBatchExpired(payload);
  }
}