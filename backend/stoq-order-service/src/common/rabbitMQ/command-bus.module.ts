import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { CommandBusService } from './command-bus.service';
// 1. ДОБАВИТЬ ИМПОРТ КОНСТАНТ
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from 'src/common/rabbitMQ/rabbitmq-topology';

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

        enableControllerDiscovery: true,

        exchanges: [
          {
            name: EXCHANGES.COMMANDS,
            type: 'topic',
            createExchangeIfNotExists: true,
            durable: true,
          },
          {
            name: EXCHANGES.EVENTS,
            type: 'topic',
            createExchangeIfNotExists: true,
            durable: true,
          },
        ],
        queues: [
          {
            name: QUEUES.RECOMMENDATION_EVENTS,
            exchange: EXCHANGES.EVENTS,
            routingKey: ROUTING_KEYS.ORDER_CREATED,
            createQueueIfNotExists: true,
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
  exports: [CommandBusService],
})
export class CommandBusModule {}
