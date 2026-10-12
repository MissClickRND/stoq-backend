import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { SuppliesModule } from "./supplies/supplies.module";
import { InventoryModule } from "./inventory/inventory.module";
import { RabbitMQModule } from "@golevelup/nestjs-rabbitmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EXCHANGES, QUEUES, ROUTING_KEYS } from "./common/rabbitmq-topology";

@Module({
  imports: [PrismaModule, SuppliesModule, InventoryModule,
    ConfigModule.forRoot({ isGlobal: true }),
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>(
          "RABBITMQ_URL",
          "amqp://admin:admin@localhost:5672",
        ),
        connectionInitOptions: { wait: true },
        exchanges: [
          {
            name: EXCHANGES.COMMANDS,
            type: "topic",
            createExchangeIfNotExists: true,
            durable: true,
          },
        ],
        queues: [
          {
            name: QUEUES.INVENTORY_COMMANDS,
            exchange: EXCHANGES.COMMANDS,
            routingKey: ROUTING_KEYS.INVENTORY_COMMANDS_MASK,
            createQueueIfNotExists: true,
            durable: true,
          },
        ],
        errorHandler: (channel, message, error) => {
          console.error("RabbitMQ processing error:", error.message);
          channel.nack(message, false, false);
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
