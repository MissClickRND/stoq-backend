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

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.GET_DAILY_STATISTICS, queue: QUEUES.RECOMMENDATION_COMMANDS })
  getDailyStatistics(payload: { date: string }) {
    return executeRpc(() => this.statisticsService.getDailyStatistics(payload?.date));
  }

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.GET_DASHBOARD_STATISTICS, queue: QUEUES.RECOMMENDATION_COMMANDS })
  getDashboardStatistics(payload: { days?: number }) {
    return executeRpc(() => this.statisticsService.getDashboardStatistics(payload.days));
  }

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.GET_DISH_DETAILS_STATISTICS, queue: QUEUES.RECOMMENDATION_COMMANDS })
  getDishDetailsStatistics(payload: { id: number; days?: number }) {
    return executeRpc(() => this.statisticsService.getDishDetailsStatistics(payload.id, payload.days));
  }

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.GET_SHORTAGE_STATISTICS, queue: QUEUES.RECOMMENDATION_COMMANDS })
  getShortageStatistics(payload: { days?: number }) {
    return executeRpc(() => this.statisticsService.getShortageStatistics(payload.days));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DISH_STATISTICS,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  getDishesStatistics(payload: { forceRefresh?: boolean } = {}) {
    return executeRpc(() => this.statisticsService.getDishesStatistics(payload.forceRefresh === true));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_ORDER_STATISTICS_TODAY,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  getOrdersTodayStatistics() {
    return executeRpc(() => this.statisticsService.getOrdersTodayStatistics());
  }
}
