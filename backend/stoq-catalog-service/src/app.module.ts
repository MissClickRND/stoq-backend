import { APP_INTERCEPTOR } from '@nestjs/core';
import { RestaurantInterceptor } from './common/tenant/restaurant.interceptor';
import { Module } from "@nestjs/common";
import { AppService } from "./app.service";
import { ProductModule } from "./product/product.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ConfigModule } from "@nestjs/config";
import { DishesModule } from "./dishes/dishes.module";
import { RecipesModule } from "./recipes/recipes.module";
import { CommandBusModule } from "./common/rabbitMQ/command-bus.module";

@Module({
  imports: [
    ProductModule,
    PrismaModule,
    DishesModule,
    RecipesModule,
    ConfigModule.forRoot({ isGlobal: true }),
    CommandBusModule
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RestaurantInterceptor },AppService],
})
export class AppModule {}
