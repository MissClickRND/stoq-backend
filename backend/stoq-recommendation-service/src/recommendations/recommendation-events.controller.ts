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
  private readonly logger = new Logger(RecommendationEventsController.name);

  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly commandBusService: CommandBusService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.STOCK_CHANGED,
    queue: QUEUES.RECOMMENDATION_EVENTS,
  })
  async onStockChanged(payload: any) {
    const reason = typeof payload === "string" ? payload : "STOCK_CHANGED";
    this.logger.log(`Получено событие изменения остатков: ${reason}`);
    await this.refreshAndPublish(reason, payload);
  }

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.BATCH_EXPIRED,
    queue: QUEUES.RECOMMENDATION_EVENTS,
  })
  async onBatchExpired(payload: any) {
    this.logger.log(
      `Получено событие истечения срока годности партии`,
      payload,
    );
    await this.refreshAndPublish("BATCH_EXPIRED", payload);
  }

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.ORDER_CREATED,
    queue: QUEUES.RECOMMENDATION_EVENTS,
  })
  async onOrderCreated(payload: any) {
    this.logger.log(`Получено событие создания заказа`);
    await this.refreshAndPublish("ORDER_CREATED", payload);
  }

  private async refreshAndPublish(reason: string, sourceEvent: any) {
    try {
      const refreshed =
        await this.recommendationService.refreshAfterEvent(reason);

      await this.commandBusService.publishEvent(
        EXCHANGES.EVENTS,
        ROUTING_KEYS.STOP_LIST_UPDATED,
        refreshed,
      );

      this.logger.log(
        `Рекомендации успешно обновлены и опубликованы после события: ${reason}`,
      );
    } catch (err) {
      this.logger.error(
        `Ошибка при обновлении рекомендаций после события ${reason}`,
        err,
      );
    }
  }
}
