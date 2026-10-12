import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
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
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
