import { Module } from "@nestjs/common";
import { StatisticsService } from "./statistics.service";
import { StatisticsController } from "./statistics.controller";
import { RecommendationsModule } from "src/recommendations/recommendations.module";
import { StatisticsRPCController } from "./statistics-rpc.controller";
import { CommandBusModule } from "src/common/rabbitMQ/command-bus.module";

@Module({
  imports: [RecommendationsModule, CommandBusModule],
  providers: [StatisticsService, StatisticsRPCController],
  // controllers: [StatisticsController]
})
export class StatisticsModule {}
