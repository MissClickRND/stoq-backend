import { AmqpConnection } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export interface DomainEvent<T> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  version: number;
  source: string;
  data: T;
}

@Injectable()
export class EventBusService {
  constructor(private readonly amqpConnection: AmqpConnection) {}

  publish<T>(
    exchange: string,
    routingKey: string,
    data: T,
    source = "recommendation-service",
  ): void {
    const message: DomainEvent<T> = {
      eventId: randomUUID(),
      eventType: routingKey,
      occurredAt: new Date().toISOString(),
      version: 1,
      source,
      data,
    };

    this.amqpConnection.publish(exchange, routingKey, message, {
      persistent: true,
      contentType: "application/json",
    });
  }
}
