import { Module } from "@nestjs/common";
import { RabbitMQModule } from "@golevelup/nestjs-rabbitmq";
import { SETTINGS, Settings } from "../config/environment";
import { SettingsModule } from "../config/settings.module";
import { UpdModule } from "../upd/upd.module";
import { AiRpcController } from "./ai-rpc.controller";
import { EXCHANGES } from "../common/rabbitMQ/rabbitmq-topology";

@Module({
  imports: [
    SettingsModule,
    UpdModule,
    RabbitMQModule.forRootAsync({
      imports: [SettingsModule],
      inject: [SETTINGS],
      useFactory: (settings: Settings) => ({
        uri: settings.RABBITMQ_URL,
        connectionInitOptions: { wait: true, timeout: 10000 },
        exchanges: [
          {
            name: EXCHANGES.COMMANDS,
            type: "topic",
            createExchangeIfNotExists: true,
            options: { durable: true },
          },
        ],
        prefetchCount: settings.MAX_CONCURRENT_RECOGNITIONS,
      }),
    }),
  ],
  providers: [AiRpcController],
})
export class AiMessagingModule {}
