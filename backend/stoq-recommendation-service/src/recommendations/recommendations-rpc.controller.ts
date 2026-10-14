import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { executeRpc } from "src/common/utils/rpc-handler";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "src/common/rabbitMQ/rabbitmq-topology";
import { RecommendationService } from "./recommendations.service";
import { DependencyGraphService } from "./dependency-graph/dependency-graph.service";

@Injectable()
export class RecommendationsRPCController {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly dependencyGraphService: DependencyGraphService,
  ) {}

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DEPENDENCY_GRAPH,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  async getGraph() {
    const result = await executeRpc(async () =>
      this.dependencyGraphService.getGraph(),
    );
    return result;
  }
  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_RECOMMENDATION,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  async findAll(payload: { search?: string }) {
    const result = await executeRpc(async () =>
      this.recommendationService.getStopListDishes(payload.search),
    );
    return result;
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DISH_RECOMMENDATION,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  getDishRecommendations() {
    return executeRpc(() =>
      this.recommendationService.getDishRecommendations(),
    );
  }
}
