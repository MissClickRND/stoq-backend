import { Module } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { RecommendationsModule } from 'src/recommendations/recommendations.module';

@Module({
  imports: [RecommendationsModule],
  providers: [StatisticsService],
  controllers: [StatisticsController]
})
export class StatisticsModule {}
