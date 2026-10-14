import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { executeRpc } from "src/common/utils/rpc-handler";

import {
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES,
} from "src/common/rabbitMQ/rabbitmq-topology";
import { RecommendationProjectionService } from "./recommendation-projection.service";
import { DependencyGraphService } from "./dependency-graph/dependency-graph.service";
import { RecommendationService } from "./recommendations.service";

@Injectable()
export class RecommendationsRPCController {
  constructor(
    private readonly projectionService: RecommendationProjectionService,
    private readonly graphService: DependencyGraphService,
    private readonly recommendationService: RecommendationService,
  ) {}

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DEPENDENCY_GRAPH,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  getDependencyGraph() {
    return executeRpc(() => this.graphService.getGraph());
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_RECOMMENDATION,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  findAll(payload: { search?: string }) {
    return executeRpc(async () =>
      this.projectionService.getStopList(payload.search),
    );
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DISH_RECOMMENDATION,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  getDishRecommendations() {
    return executeRpc(() =>
      this.recommendationService.getDishRecommendationsFromServices(),
    );
  }
}
