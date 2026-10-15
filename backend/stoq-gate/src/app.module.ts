import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProductController } from './controllers/catalog/product/product.controller';
import { RecipesController } from './controllers/catalog/recipes/recipes.controller';
import { DishesController } from './controllers/catalog/dishes/dishes.controller';
import { SupplyController } from './controllers/inventory/supplies/supplies.controller';
import { InventoryController } from './controllers/inventory/inventory/inventory.controller';
import { CommandBusModule } from './common/rabbitMQ/command-bus.module';
import { OrderController } from './controllers/order/order.controller';
import { AiModule } from './controllers/ai/ai.module';
import { DependencyGraphController } from './controllers/analytics/dependency-graph.controller';
import { StatisticsController } from './controllers/recommendation/statistics/statistics.controller';
import { RecommendationEventsListener } from './controllers/recommendation/recommendation/recommendation-events.listener';
import { RecommendationsWsGateway } from './controllers/recommendation/recommendation/recommendation.ws.gateway';
import { RecommendationsController } from './controllers/recommendation/recommendation/recommendation.controller';
import { InventoryEventsListener } from './controllers/inventory/inventory/inventory-events.listener';
import { InventoryWsGateway } from './controllers/inventory/inventory/inventory.ws.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommandBusModule,
    AiModule,
  ],
  controllers: [
    ProductController,
    // RecipesController,
    DishesController,
    SupplyController,
    InventoryController,
    OrderController,
    DependencyGraphController,
    StatisticsController,
    RecommendationsController,
  ],
  providers: [
    RecommendationsWsGateway,
    RecommendationEventsListener,
    InventoryEventsListener,
    InventoryWsGateway,
  ],
})
export class AppModule {}
