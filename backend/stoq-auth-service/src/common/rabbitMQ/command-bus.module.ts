import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RabbitMQModule } from "@golevelup/nestjs-rabbitmq";
import { EXCHANGES } from "./rabbitmq-topology";

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>(
          "RABBITMQ_URL",
          "amqp://admin:admin@localhost:5672",
        ),
        connectionInitOptions: { wait: true },
        exchanges: [{ name: EXCHANGES.COMMANDS, type: "topic", durable: true }],
      }),
    }),
  ],
  exports: [RabbitMQModule],
})
export class CommandBusModule {}
