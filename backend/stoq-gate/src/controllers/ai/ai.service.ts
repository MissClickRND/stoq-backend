import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBusService } from '../../common/rabbitMQ/command-bus.service';
import {
  EXCHANGES,
  ROUTING_KEYS,
} from '../../common/rabbitMQ/rabbitmq-topology';
import { z } from 'zod';
import type { Multer } from 'multer';

const number = z.number().nonnegative().nullable();
const resultSchema = z.strictObject({
  sellerName: z.string().min(1).nullable(),
  items: z
    .array(
      z.strictObject({
        name: z.string().min(1).nullable(),
        quantity: number,
        price: z.number().int().nonnegative().nullable(),
        totalPrice: z.number().int().nonnegative().nullable(),
        unit: z.string().min(1).nullable(),
      }),
    )
    .min(1),
});
const supplyItemsSchema = z
  .array(
    z.strictObject({
      productId: z.number().int().positive(),
      name: z.string().trim().min(1),
      quantity: number,
      price: number,
      totalPrice: number,
      unit: z.strictObject({
        id: z.number().int().positive(),
        name: z.string().min(1),
        shortName: z.string().min(1),
      }),
    }),
  )
  .min(1);

function integer(
  config: ConfigService,
  key: string,
  fallback: number,
  max: number,
): number {
  const value = Number(config.get(key, fallback));
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error(`Некорректная конфигурация ${key}`);
  return value;
}

@Injectable()
export class AiService {
  private readonly timeoutMs: number;
  private readonly maxFileBytes: number;
  constructor(
    private readonly bus: CommandBusService,
    config: ConfigService,
  ) {
    this.timeoutMs = integer(config, 'AI_RPC_TIMEOUT_MS', 150000, 660000);
    this.maxFileBytes =
      integer(config, 'AI_MAX_FILE_SIZE_MB', 20, 20) * 1024 * 1024;
  }
  async recognize(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length)
      throw new HttpException(
        {
          code: 'FILE_REQUIRED',
          message: 'Загрузите непустой файл в поле file',
        },
        400,
      );
    if (file.buffer.length > this.maxFileBytes)
      throw new HttpException(
        { code: 'FILE_TOO_LARGE', message: 'Превышен допустимый размер файла' },
        413,
      );
    if (file.originalname.length > 255 || file.mimetype.length > 100)
      throw new HttpException(
        { code: 'INVALID_FILE', message: 'Некорректные параметры файла' },
        400,
      );
    const response = await this.request(
      ROUTING_KEYS.AI_RECOGNIZE_UPD,
      {
        file: {
          originalname: file.originalname,
          mimetype: file.mimetype,
          base64: file.buffer.toString('base64'),
        },
        deadlineAt: Date.now() + this.timeoutMs,
      },
      this.timeoutMs,
    );
    const parsed = resultSchema.safeParse(response);
    if (!parsed.success)
      throw new HttpException(
        {
          code: 'AI_INVALID_RESPONSE',
          message: 'AI-сервис вернул некорректный результат',
        },
        502,
      );
    return parsed.data;
  }
  async health() {
    const response = await this.request(ROUTING_KEYS.AI_HEALTH, {}, 15000);
    if (response?.status !== 'ok')
      throw new HttpException(
        {
          code: 'AI_INVALID_RESPONSE',
          message: 'Некорректный ответ проверки AI-сервиса',
        },
        502,
      );
    return { status: 'ok' };
  }
  async prepareSupply(file: Express.Multer.File | undefined) {
    const recognized = await this.recognize(file);
    let reply: any;
    try {
      reply = await this.bus.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.RESOLVE_UPD_PRODUCTS,
        { items: recognized.items },
        { timeoutMs: 30000 },
      );
    } catch (error) {
      const timeout =
        error instanceof Error && /timeout|timed out/i.test(error.message);
      throw new HttpException(
        {
          code: timeout ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE',
          message: timeout
            ? 'Превышено время ожидания каталога товаров'
            : 'Каталог товаров недоступен. Повторите попытку',
        },
        timeout ? 504 : 503,
      );
    }
    if (reply?.success === false && reply.error) {
      const status = Number(reply.error.status);
      throw new HttpException(
        {
          code: 'CATALOG_ERROR',
          message:
            typeof reply.error.message === 'string'
              ? reply.error.message.slice(0, 500)
              : 'Не удалось подготовить товары из УПД',
        },
        status >= 400 && status <= 599 ? status : 502,
      );
    }
    const parsed = supplyItemsSchema.safeParse(
      reply?.success === true ? reply.data : undefined,
    );
    if (!parsed.success)
      throw new HttpException(
        {
          code: 'CATALOG_INVALID_RESPONSE',
          message: 'Каталог вернул некорректные товары из УПД',
        },
        502,
      );
    return { sellerName: recognized.sellerName, items: parsed.data };
  }
  private async request(
    routingKey: string,
    payload: unknown,
    timeoutMs: number,
  ) {
    let reply: any;
    try {
      reply = await this.bus.sendCommand(
        EXCHANGES.COMMANDS,
        routingKey,
        payload,
        { timeoutMs },
      );
    } catch (error) {
      const timeout =
        error instanceof Error && /timeout|timed out/i.test(error.message);
      throw new HttpException(
        {
          code: timeout ? 'AI_SERVICE_TIMEOUT' : 'AI_SERVICE_UNAVAILABLE',
          message: timeout
            ? 'Превышено время ожидания AI-сервиса'
            : 'AI-сервис или RabbitMQ недоступен',
        },
        timeout ? 504 : 503,
      );
    }
    if (reply?.success === true) return reply.data;
    if (reply?.success === false && reply.error) {
      const status = Number(reply.error.status);
      const code =
        typeof reply.error.code === 'string' &&
        /^[A-Z0-9_]{1,80}$/.test(reply.error.code)
          ? reply.error.code
          : 'AI_SERVICE_ERROR';
      const message =
        typeof reply.error.message === 'string'
          ? reply.error.message.slice(0, 500)
          : 'Ошибка AI-сервиса';
      throw new HttpException(
        { code, message },
        status >= 400 && status <= 599 ? status : 502,
      );
    }
    throw new HttpException(
      {
        code: 'AI_INVALID_RESPONSE',
        message: 'Некорректный RPC-ответ AI-сервиса',
      },
      502,
    );
  }
}
