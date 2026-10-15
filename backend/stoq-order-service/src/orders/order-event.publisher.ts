import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EXCHANGES, ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';

export type OrderCreatedEvent = {
  eventId: string;
  orderId: string;
  restaurantId?: number;
  items: Array<{ dishId: string; quantity: number }>;
  createdAt: string;
};

@Injectable()
export class OrderEventPublisher {
  constructor(private readonly commandBusService: CommandBusService) {}

  async publishOrderCreated(order: any) {
    const event: OrderCreatedEvent = {
      eventId: randomUUID(),
      orderId: order.id,
      restaurantId: order.restaurantId,
      items: order.items,
      createdAt: new Date().toISOString(),
    };

    const result = await this.commandBusService.publishEvent(
      EXCHANGES.EVENTS,
      ROUTING_KEYS.ORDER_CREATED,
      event,
    );
  }
}
