import { Module } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';

@Module({
  providers: [RecommendationsService],
  controllers: [RecommendationsController]
})
export class RecommendationsModule {}
