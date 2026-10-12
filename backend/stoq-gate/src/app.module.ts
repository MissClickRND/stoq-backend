import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProductController } from './controllers/catalog/product/product.controller';
import { RecipesController } from './controllers/catalog/recipes/recipes.controller';
import { DishesController } from './controllers/catalog/dishes/dishes.controller';
import { SupplyController } from './controllers/inventory/supplies/supplies.controller';
import { InventoryController } from './controllers/inventory/inventory/inventory.controller';
import { CommandBusModule } from './common/rabbitMQ/command-bus.module';
import { OrderController } from './controllers/order/order.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CommandBusModule],
  controllers: [
    ProductController,
    // RecipesController,
    DishesController,
    SupplyController,
    InventoryController,
    OrderController,
  ],
})
export class AppModule {}
