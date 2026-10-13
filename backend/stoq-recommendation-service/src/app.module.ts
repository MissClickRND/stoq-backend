import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { RecommendationsModule } from "./recommendations/recommendations.module";
import { CommandBusModule } from "./common/rabbitMQ/command-bus.module";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
    PrismaModule,
    RecommendationsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    CommandBusModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
