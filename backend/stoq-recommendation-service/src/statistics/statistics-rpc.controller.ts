import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { executeRpc } from "src/common/utils/rpc-handler";
import {
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES,
} from "src/common/rabbitMQ/rabbitmq-topology";
import { StatisticsService } from "./statistics.service";

@Injectable()
export class StatisticsRPCController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DISH_STATISTICS,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  getDishesStatistics() {
    return executeRpc(() => this.statisticsService.getDishesStatistics());
  }
}
