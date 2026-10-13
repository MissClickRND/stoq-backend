import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { executeRpc } from "src/common/utils/rpc-handler";

import {
  EXCHANGES,
  ROUTING_KEYS,
  QUEUES,
} from "src/common/rabbitMQ/rabbitmq-topology";
import { RecommendationService } from "./recommendations.service";
import { DishRecommendationsDto } from "./dto/dish-recommendations.dto";
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

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_DISH_RECOMMENDATION,
    queue: QUEUES.RECOMMENDATION_COMMANDS,
  })
  getDishRecommendations(payload: { dto: DishRecommendationsDto }) {
    return executeRpc(async () =>
      this.recommendationService.calculateDishRecommendations(
        payload.dto.dishes.map((dish) => ({
          ...dish,
          recipeItems: dish.recipeItems.map((item) => ({
            ...item,
            productName: item.productName ?? `Продукт ${item.productId}`,
          })),
        })),
        payload.dto.batches,
      ),
    );
  }
}
