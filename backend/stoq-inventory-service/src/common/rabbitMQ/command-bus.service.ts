import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CommandBusService {
  constructor(private readonly amqpConnection: AmqpConnection) {}

  public async sendCommand(exchange: string, routingKey: string, payload: any, options?: { timeoutMs?: number }) {
    return this.amqpConnection.request({
      exchange,
      routingKey,
      payload,
      timeout: options?.timeoutMs ?? 5000,
      expiration: options?.timeoutMs === undefined ? undefined : String(options.timeoutMs),
    });
  }
}
