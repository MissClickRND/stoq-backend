import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { CommandBusModule } from '../../common/rabbitMQ/command-bus.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { HttpExceptionFilter } from './http-exception.filter';
import { AiUploadInterceptor } from './ai-upload.interceptor';

@Module({
  imports: [ConfigModule, CommandBusModule, MulterModule.registerAsync({
    imports: [ConfigModule], inject: [ConfigService],
    useFactory: (config: ConfigService) => {
      const size = Number(config.get('AI_MAX_FILE_SIZE_MB', 20));
      if (!Number.isSafeInteger(size) || size < 1 || size > 20) throw new Error('Некорректная конфигурация AI_MAX_FILE_SIZE_MB');
      return { limits: { fileSize: size * 1024 * 1024, files: 1, fields: 0, parts: 1 } };
    },
  })],
  controllers: [AiController], providers: [AiService, AiUploadInterceptor, HttpExceptionFilter], exports: [AiService],
})
export class AiModule {}
