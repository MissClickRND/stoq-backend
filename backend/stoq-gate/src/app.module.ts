import { AuditController } from "./audit/audit.controller";
import { AuditService } from "./audit/audit.service";
import { AuditInterceptor } from "./audit/audit.interceptor";
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RestaurantInterceptor } from './common/tenant/restaurant.interceptor';
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
import { TestController } from './controllers/test/test.controller';
import { DemoRestaurantController } from './controllers/test/demo-restaurant.controller';
import { DemoRestaurantService } from './controllers/test/demo-restaurant.service';
import { AuthModule } from './auth/auth.module';
import { MenuController } from './controllers/catalog/dishes/menu.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommandBusModule,
    AuthModule,
    AiModule,
  ],
  controllers: [
    AuditController,
    MenuController,
    ProductController,
    TestController,
    DemoRestaurantController,
    // RecipesController,
    DishesController,
    SupplyController,
    InventoryController,
    OrderController,
    DependencyGraphController,
    StatisticsController,
    RecommendationsController,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RestaurantInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }, AuditService,
    DemoRestaurantService,
    RecommendationsWsGateway,
    RecommendationEventsListener,
    InventoryEventsListener,
    InventoryWsGateway,
  ],
})
export class AppModule {}
