import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';

@Injectable()
export class AiUploadInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;
  constructor(config: ConfigService) {
    const size = Number(config.get('AI_MAX_FILE_SIZE_MB', 20));
    if (!Number.isSafeInteger(size) || size < 1 || size > 20) throw new Error('Некорректная конфигурация AI_MAX_FILE_SIZE_MB');
    const Interceptor = FileInterceptor('file', {
      limits: { fileSize: size * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    });
    this.delegate = new Interceptor();
  }
  intercept(context: ExecutionContext, next: CallHandler) { return this.delegate.intercept(context, next); }
}
