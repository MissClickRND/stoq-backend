import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { CommandBusModule } from '../common/rabbitMQ/command-bus.module';
import { RecommendationsRPCController } from './recommendations-rpc.controller';

@Module({
  imports: [CommandBusModule],
  providers: [RecommendationService, RecommendationsRPCController],
  // controllers: [RecommendationsController],
})
export class RecommendationsModule {}
