import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { CommandBusModule } from '../common/rabbitMQ/command-bus.module';

@Module({
  imports: [CommandBusModule],
  providers: [RecommendationService],
  controllers: [RecommendationsController],
})
export class RecommendationsModule {}
