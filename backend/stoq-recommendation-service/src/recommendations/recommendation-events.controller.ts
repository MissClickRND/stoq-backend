import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Injectable, Logger } from "@nestjs/common";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "src/common/rabbitMQ/rabbitmq-topology";
import { RecommendationService } from "./recommendations.service";
import { CommandBusService } from "src/common/rabbitMQ/command-bus.service";

@Injectable()
export class RecommendationEventsController {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly commandBusService: CommandBusService,
  ) {}

  //   @RabbitSubscribe({
  //     exchange: EXCHANGES.EVENTS,
  //     routingKey: ROUTING_KEYS.INVENTORY_UPDATED,
  //     queue: QUEUES.RECOMMENDATION_EVENTS,
  //   })
  //   async onInventoryUpdated(payload: any) {
  //     await this.refreshAndPublish('inventory_updated', payload);
  //   }

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.ORDER_CREATED,
    queue: QUEUES.RECOMMENDATION_EVENTS,
  })
  async onOrderCreated(payload: any) {
    await this.refreshAndPublish("new_order", payload);
  }

  private async refreshAndPublish(reason: string, sourceEvent: any) {
    try {
      const refreshed =
        await this.recommendationService.refreshAfterEvent(reason);
      const result = await this.commandBusService.publishEvent(
        EXCHANGES.EVENTS,
        ROUTING_KEYS.STOP_LIST_UPDATED,
        refreshed,
      );
    } catch (err) {
      throw err;
    }
  }
}
