import { APP_INTERCEPTOR } from '@nestjs/core';
import { RestaurantInterceptor } from './common/tenant/restaurant.interceptor';
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { SuppliesModule } from "./supplies/supplies.module";
import { InventoryModule } from "./inventory/inventory.module";
import { CommandBusModule } from "./common/rabbitMQ/command-bus.module";
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [
    PrismaModule,
    SuppliesModule,
    InventoryModule,
    CommandBusModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RestaurantInterceptor },AppService],
})
export class AppModule {}
