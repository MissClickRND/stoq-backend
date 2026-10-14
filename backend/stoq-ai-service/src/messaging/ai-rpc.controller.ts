import { HttpException, Inject, Injectable } from "@nestjs/common";
import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { z } from "zod";
import { ApiError } from "../common/api-error";
import { SETTINGS, Settings } from "../config/environment";
import { UpdService } from "../upd/upd.service";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "../common/rabbitMQ/rabbitmq-topology";

@Injectable()
export class AiRpcController {
  constructor(
    @Inject(SETTINGS) private readonly settings: Settings,
    private readonly service: UpdService,
  ) {}

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.AI_RECOGNIZE_UPD,
    queue: QUEUES.AI_COMMANDS,
    queueOptions: { durable: true },
  })
  async recognize(payload: unknown): Promise<unknown> {
    try {
      const parsed = z
        .strictObject({
          file: z.strictObject({
            originalname: z.string().min(1).max(255),
            mimetype: z.string().min(1).max(100),
            base64: z.string().min(1),
          }),
          deadlineAt: z.number().int().positive(),
        })
        .safeParse(payload);
      if (!parsed.success)
        throw new ApiError(
          400,
          "INVALID_AI_COMMAND",
          "Некорректная команда распознавания",
        );
      if (parsed.data.deadlineAt <= Date.now())
        throw new ApiError(
          504,
          "AI_REQUEST_EXPIRED",
          "Время ожидания распознавания истекло до обработки",
        );
      const limit = this.settings.MAX_FILE_SIZE_MB * 1024 * 1024;
      const { base64, originalname, mimetype } = parsed.data.file;
      if (base64.length > Math.ceil(limit / 3) * 4)
        throw new ApiError(
          413,
          "FILE_TOO_LARGE",
          "Превышен допустимый размер файла",
        );
      if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
        throw new ApiError(
          400,
          "INVALID_AI_COMMAND",
          "Некорректное содержимое файла",
        );
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length > limit)
        throw new ApiError(
          413,
          "FILE_TOO_LARGE",
          "Превышен допустимый размер файла",
        );
      if (buffer.toString("base64") !== base64)
        throw new ApiError(
          400,
          "INVALID_AI_COMMAND",
          "Некорректное кодирование файла",
        );
      const data = await this.service.recognize({
        buffer,
        size: buffer.length,
        originalname,
        mimetype,
      } as Express.Multer.File);
      return { success: true, data };
    } catch (error) {
      if (error instanceof HttpException) {
        const body = error.getResponse() as { code?: string; message?: string };
        return {
          success: false,
          error: {
            status: error.getStatus(),
            code: body.code ?? "AI_REQUEST_ERROR",
            message: body.message ?? "Ошибка обработки документа",
          },
        };
      }
      return {
        success: false,
        error: {
          status: 500,
          code: "AI_INTERNAL_ERROR",
          message: "Внутренняя ошибка AI-сервиса",
        },
      };
    }
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.AI_HEALTH,
    queue: QUEUES.AI_HEALTH,
    queueOptions: { durable: true },
  })
  async health(): Promise<unknown> {
    return { success: true, data: { status: "ok" } };
  }
}
