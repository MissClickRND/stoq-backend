import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CommandBusService {
  constructor(private readonly amqpConnection: AmqpConnection) {}

  sendCommand<T>(exchange: string, routingKey: string, payload: unknown) {
    return this.amqpConnection.request<T>({
      exchange,
      routingKey,
      payload,
      timeout: 5000,
    });
  }
}
