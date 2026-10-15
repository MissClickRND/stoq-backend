import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RabbitMQModule } from "@golevelup/nestjs-rabbitmq";
import { CommandBusService } from "./command-bus.service";
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
        enableControllerDiscovery: true,
        exchanges: [
          {
            name: "app.commands",
            type: "topic",
            createExchangeIfNotExists: true,
            durable: true,
          },
          {
            name: "app.events",
            type: "topic",
            createExchangeIfNotExists: true,
            durable: true,
          },
        ],
        errorHandler: (channel: any, message: any) => {
          setTimeout(() => {
            try {
              channel.nack(message, false, true);
            } catch {}
          }, 1000);
        },
      }),
    }),
  ],
  providers: [CommandBusService],
  exports: [CommandBusService],
})
export class CommandBusModule {}
