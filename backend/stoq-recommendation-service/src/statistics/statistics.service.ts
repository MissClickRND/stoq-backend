import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { CommandBusService } from "src/common/rabbitMQ/command-bus.service";
import { EXCHANGES, ROUTING_KEYS } from "src/common/rabbitMQ/rabbitmq-topology";
import { RecommendationService } from "../recommendations/recommendations.service";

@Injectable()
export class StatisticsService {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly commandBusService: CommandBusService,
  ) {}

  async getDishesStatistics() {
    const dishes = await this.recommendationService.getDishStatuses();

    return {
      total: dishes.length,
      active: dishes.filter((dish) => dish.status === "AVAILABLE").length,
      lowStock: dishes.filter((dish) => dish.status === "LOW_STOCK").length,
      stopList: dishes.filter((dish) => dish.status === "STOP_LIST").length,
    };
  }

  async getOrdersTodayStatistics() {
    let response: any;

    try {
      response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_ORDERS_TODAY_STATISTICS,
        {},
      );
    } catch {
      throw new ServiceUnavailableException(
        "Сервис заказов недоступен. Повторите попытку",
      );
    }

    if (!response?.success) {
      throw new HttpException(
        response?.error?.message ?? "Сервис заказов недоступен",
        response?.error?.status ?? 502,
      );
    }

    return response.data;
  }
}
