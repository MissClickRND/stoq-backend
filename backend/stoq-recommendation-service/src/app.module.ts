import { Module } from "@nestjs/common";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { RecommendationsModule } from "./recommendations/recommendations.module";
import { CommandBusModule } from "./common/rabbitMQ/command-bus.module";
import { ConfigModule } from "@nestjs/config";
import { StatisticsModule } from './statistics/statistics.module';

@Module({
  imports: [
    PrismaModule,
    RecommendationsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    CommandBusModule,
    StatisticsModule,
  ],
  providers: [AppService],
})
export class AppModule {}
