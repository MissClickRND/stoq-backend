import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    super({ adapter: pool });
  }

  async onModuleInit() {
    await this.$connect();
    try {
      await this.$queryRaw`SELECT u."id", u."fullName", u."restaurantId", u."tokenVersion", r."id"
        FROM "User" u LEFT JOIN "Restaurant" r ON r."id" = u."restaurantId" LIMIT 0`;
    } catch (error) {
      await this.$disconnect();
      throw new Error('Auth: база не соответствует схеме. Проверьте DATABASE_URL (auth_db) и prisma migrate deploy.', { cause: error });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
