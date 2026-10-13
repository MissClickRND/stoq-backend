import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { executeRpc } from "src/common/utils/rpc-handler";

import {
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES,
} from "src/common/rabbitMQ/rabbitmq-topology";
import { RecommendationService } from "./recommendations.service";
import { DependencyGraphService } from './dependency-graph/dependency-graph.service';

@Injectable()
export class RecommendationsRPCController {
  constructor(private readonly recommendationService: RecommendationService, private readonly graphService: DependencyGraphService) {}

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
    return executeRpc(() =>
      this.recommendationService.getStopListFromServices(payload.search),
    );
  }
}
