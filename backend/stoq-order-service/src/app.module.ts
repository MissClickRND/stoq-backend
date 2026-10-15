import { APP_INTERCEPTOR } from '@nestjs/core';
import { RestaurantInterceptor } from './common/tenant/restaurant.interceptor';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { OrdersModule } from './orders/orders.module';
import { CommandBusModule } from './common/rabbitMQ/command-bus.module';

@Module({
  imports: [
    PrismaModule,
    OrdersModule,
    ConfigModule.forRoot({ isGlobal: true }),
    CommandBusModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RestaurantInterceptor },AppService],
})
export class AppModule {}
