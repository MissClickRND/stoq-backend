import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { CommandBusService } from './infrastructure/rabbit/command-bus.service';
import { EXCHANGES } from './common/rabbitmq-topology';
import { ProductController } from './controllers/catalog/product/product.controller';
import { RecipesController } from './controllers/catalog/recipes/recipes.controller';
import { DishesController } from './controllers/catalog/dishes/dishes.controller';
import { SupplyController } from './controllers/inventory/supplies/supplies.controller';
import { InventoryController } from './controllers/inventory/inventory/inventory.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>(
          'RABBITMQ_URL',
          'amqp://admin:admin@localhost:5672',
        ),
        connectionInitOptions: { wait: true },
        exchanges: [
          {
            name: EXCHANGES.COMMANDS,
            type: 'topic',
            createExchangeIfNotExists: true,
            durable: true,
          },
        ],
        errorHandler: (channel, message, error) => {
          console.error('RabbitMQ processing error:', error.message);
          channel.nack(message, false, false);
        },
      }),
    }),
  ],
  providers: [CommandBusService],
  controllers: [
    ProductController,
    RecipesController,
    DishesController,
    SupplyController,
    InventoryController,
  ],
})
export class AppModule {}
