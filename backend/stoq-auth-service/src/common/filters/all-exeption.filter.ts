import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const timestamp = new Date().toISOString();
    const path = req.originalUrl || req.url;
    const method = req.method;

    // 1) Nest HttpException
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      const message =
        typeof response === 'string'
          ? response
          : (response as any).message || exception.message;

      const details = typeof response === 'object' ? response : null;

      // Логируем только 5xx (или можно все)
      if (status >= 500) {
        this.logger.error(
          `${method} ${path} -> ${status} ${message}`,
          exception.stack,
        );
      } else {
        this.logger.warn(`${method} ${path} -> ${status} ${message}`);
      }

      return res.status(status).json({
        statusCode: status,
        message,
        code: 'HTTP_EXCEPTION',
        details,
      });
    }

    // 2) Prisma errors (по коду)
    const prismaCode = (exception as any)?.code;
    if (prismaCode) {
      const mapped = this.mapPrismaError(exception as any);

      // Prisma ошибки часто 4xx, но всё равно полезно логировать
      this.logger.warn(`${method} ${path} -> ${mapped.status} ${mapped.code}`);

      return res.status(mapped.status).json({
        statusCode: mapped.status,
        message: mapped.message,
        code: mapped.code,
        details: (exception as any)?.meta ?? null,
      });
    }

    // 3) Unknown errors (500)
    const err = exception as any;
    const message = err?.message || 'Internal Server Error';

    this.logger.error(
      `${method} ${path} -> 500 ${message}`,
      err?.stack || String(exception),
    );

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  private mapPrismaError(err: any): {
    status: number;
    message: string;
    code: string;
  } {
    if (err.code === 'P2002') {
      return {
        status: 409,
        message: 'Unique constraint failed',
        code: 'PRISMA_UNIQUE_CONSTRAINT',
      };
    }

    if (err.code === 'P2025') {
      return {
        status: 404,
        message: 'Record not found',
        code: 'PRISMA_RECORD_NOT_FOUND',
      };
    }

    return {
      status: 400,
      message: 'Database request error',
      code: `PRISMA_${err.code}`,
    };
  }
}