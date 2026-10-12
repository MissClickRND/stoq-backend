import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { RabbitMQModule } from "@golevelup/nestjs-rabbitmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EXCHANGES, QUEUES, ROUTING_KEYS } from "./common/rabbitmq-topology";
import { OrdersModule } from "./orders/orders.module";

@Module({
  imports: [
    PrismaModule,
    OrdersModule,
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
            name: QUEUES.ORDERS_COMMANDS,
            exchange: EXCHANGES.COMMANDS,
            routingKey: ROUTING_KEYS.ORDERS_COMMANDS_MASK,
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
