import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SETTINGS, Settings } from '../config/environment';
import { SettingsModule } from '../config/settings.module';
import { DocumentValidator } from './document-validator';
import { OPENROUTER_CLIENT, OpenRouterExtractor } from './openrouter-extractor';
import { ServiceKeyGuard } from './service-key.guard';
import { UpdController } from './upd.controller';
import { UpdService } from './upd.service';
import { OpenRouterTransport } from './openrouter-transport';

@Module({
  imports: [SettingsModule, MulterModule.registerAsync({
    imports: [SettingsModule], inject: [SETTINGS],
    useFactory: (settings: Settings) => ({ storage: memoryStorage(), limits: { fileSize: settings.MAX_FILE_SIZE_MB * 1024 * 1024, files: 1, fields: 0, parts: 1 } }),
  })],
  controllers: [UpdController],
  providers: [DocumentValidator, OpenRouterExtractor, UpdService, ServiceKeyGuard, OpenRouterTransport, {
    provide: OPENROUTER_CLIENT, inject: [OpenRouterTransport],
    useFactory: (transport: OpenRouterTransport) => transport.client,
  }],
  exports: [UpdService],
})
export class UpdModule {}
