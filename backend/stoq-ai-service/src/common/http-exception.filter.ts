import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost): void {
    if (host.getType<string>() !== "http") throw error;
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = randomUUID();
    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "Внутренняя ошибка сервиса";
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      const details =
        typeof body === "object"
          ? (body as { code?: string; message?: string | string[] })
          : { message: body };
      code =
        details.code ??
        {
          400: "BAD_REQUEST",
          401: "UNAUTHORIZED",
          404: "NOT_FOUND",
          413: "FILE_TOO_LARGE",
          415: "UNSUPPORTED_FILE_TYPE",
        }[status] ??
        "REQUEST_ERROR";
      message = Array.isArray(details.message)
        ? details.message.join("; ")
        : (details.message ?? message);
    }
    // Avoid logging document contents, filenames, keys or upstream error messages.
    if (status >= 500) this.logger.error(`${requestId} ${code} HTTP ${status}`);
    response.setHeader("X-Request-Id", requestId);
    response
      .status(status)
      .json({
        statusCode: status,
        code,
        message,
        path: request.path,
        requestId,
        timestamp: new Date().toISOString(),
      });
  }
}
