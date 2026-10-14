import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { RecommendationService } from "./recommendations.service";
import { RecommendationProjectionService } from "./recommendation-projection.service";
import { RecommendationsRPCController } from "./recommendations-rpc.controller";
import { DependencyGraphService } from "./dependency-graph/dependency-graph.service";
import { CommandBusModule } from "../common/rabbitMQ/command-bus.module";

@Module({
  imports: [ScheduleModule.forRoot(), CommandBusModule],
  providers: [
    RecommendationService,
    RecommendationProjectionService,
    DependencyGraphService,
    RecommendationsRPCController,
  ],
  exports: [RecommendationService, RecommendationProjectionService],
})
export class RecommendationsModule {}
