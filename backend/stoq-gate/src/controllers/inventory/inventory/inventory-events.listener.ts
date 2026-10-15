import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { InventoryWsGateway } from './inventory.ws.gateway';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';

@Injectable()
export class InventoryEventsListener {
  constructor(private readonly wsGateway: InventoryWsGateway) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.STOCK_CHANGED,
    // Each handler and gateway instance must receive its own copy.
    queue: '',
    queueOptions: { exclusive: true, autoDelete: true, durable: false },
  })
  async onStockChanged(payload: any) {
    await this.wsGateway.broadcastStockChanged(payload);
  }

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.BATCH_EXPIRED,
    queue: '',
    queueOptions: { exclusive: true, autoDelete: true, durable: false },
  })
  async onBatchExpired(payload: any) {
    await this.wsGateway.broadcastBatchExpired(payload);
  }
}
