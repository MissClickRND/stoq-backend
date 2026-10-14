import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          db: Number(process.env.REDIS_DB ?? 0),
          maxRetriesPerRequest: 3,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}