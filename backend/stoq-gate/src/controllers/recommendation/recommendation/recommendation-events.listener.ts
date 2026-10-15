import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import {
  EXCHANGES,
  ROUTING_KEYS,
} from 'src/common/rabbitMQ/rabbitmq-topology';
import { RecommendationsWsGateway } from './recommendation.ws.gateway';

@Injectable()
export class RecommendationEventsListener {
  constructor(private readonly wsGateway: RecommendationsWsGateway) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.STOP_LIST_UPDATED,
    queue: '',
    queueOptions: { exclusive: true, autoDelete: true, durable: false },
  })
  onStopListUpdated(payload: any) {
    this.wsGateway.broadcastStopListUpdated(payload);
  }
}
