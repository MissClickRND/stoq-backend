import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { CommandBusModule } from '../common/rabbitMQ/command-bus.module';
import { RecommendationsRPCController } from './recommendations-rpc.controller';
import { DependencyGraphService } from './dependency-graph/dependency-graph.service';

@Module({
  exports: [RecommendationService],
  imports: [CommandBusModule],
  providers: [RecommendationService, DependencyGraphService, RecommendationsRPCController],
  controllers: [RecommendationsController],
})
export class RecommendationsModule {}
