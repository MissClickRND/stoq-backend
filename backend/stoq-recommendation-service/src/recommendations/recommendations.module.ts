import { ShortageTracker } from "./shortage-tracker";
import { Module } from "@nestjs/common";
import { RecommendationService } from "./recommendations.service";
import { RecommendationsRPCController } from "./recommendations-rpc.controller";
import { DependencyGraphService } from "./dependency-graph/dependency-graph.service";
import { CommandBusModule } from "../common/rabbitMQ/command-bus.module";
import { RecommendationsController } from "./recommendations.controller";
import { RecommendationEventsController } from "./recommendation-events.controller";

@Module({
  imports: [CommandBusModule],
  // controllers: [RecommendationsController],
  providers: [
    RecommendationService,
    ShortageTracker,
    DependencyGraphService,
    RecommendationsRPCController,
    RecommendationEventsController,
  ],
  exports: [RecommendationService, ShortageTracker],
})
export class RecommendationsModule {}
