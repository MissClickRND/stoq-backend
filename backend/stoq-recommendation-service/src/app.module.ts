import { APP_INTERCEPTOR } from '@nestjs/core';
import { RestaurantInterceptor } from './common/tenant/restaurant.interceptor';
import { Module } from "@nestjs/common";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { RecommendationsModule } from "./recommendations/recommendations.module";
import { CommandBusModule } from "./common/rabbitMQ/command-bus.module";
import { ConfigModule } from "@nestjs/config";
import { StatisticsModule } from "./statistics/statistics.module";
import { RedisModule } from "./common/redis/redis.module";

@Module({
  imports: [
    PrismaModule,
    RecommendationsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    CommandBusModule,
    StatisticsModule,
    RedisModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RestaurantInterceptor },AppService],
})
export class AppModule {}
