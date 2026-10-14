import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RabbitMQModule } from "@golevelup/nestjs-rabbitmq";
import { Channel, ConsumeMessage } from "amqplib";
import { CommandBusService } from "./command-bus.service";
import { EXCHANGES } from "./rabbitmq-topology";

@Module({
  imports: [
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
        errorHandler: (
          channel: Channel,
          message: ConsumeMessage,
          error: Error,
        ) => {
          console.error("RabbitMQ processing error:", error.message);
          channel.nack(message, false, false);
        },
      }),
    }),
  ],
  providers: [CommandBusService],
  exports: [CommandBusService],
})
export class CommandBusModule {}
