import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommandBusService } from "../../common/rabbitMQ/command-bus.service";
import {
  EXCHANGES,
  ROUTING_KEYS,
} from "../../common/rabbitMQ/rabbitmq-topology";
import { buildDependencyGraph } from "./dependency-graph.builder";

@Injectable()
export class DependencyGraphService {
  private readonly lowStockPortions: number;
  constructor(
    private readonly commandBusService: CommandBusService,
    config: ConfigService,
  ) {
    this.lowStockPortions = Number(
      config.get("DEPENDENCY_GRAPH_LOW_STOCK_PORTIONS", 5),
    );
    if (
      !Number.isSafeInteger(this.lowStockPortions) ||
      this.lowStockPortions < 1 ||
      this.lowStockPortions > 10000
    ) {
      throw new Error("Некорректный порог DEPENDENCY_GRAPH_LOW_STOCK_PORTIONS");
    }
  }
  async getGraph() {
    let response: any;
    try {
      response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_DISHES,
        {},
      );
    } catch {
      throw new ServiceUnavailableException(
        "Каталог или склад недоступен. Повторите попытку",
      );
    }
    if (!response?.success) {
      throw new HttpException(
        response?.error?.message ?? "Не удалось загрузить данные каталога",
        response?.error?.status ?? 502,
      );
    }
    return buildDependencyGraph(response.data, this.lowStockPortions);
  }
}
