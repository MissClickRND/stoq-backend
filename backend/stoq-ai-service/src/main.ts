import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EcosystemModule } from './ecosystem.module';
import { SETTINGS, Settings } from './config/environment';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(process.env.RABBITMQ_ENABLED === 'false' ? AppModule : EcosystemModule);
  const settings = app.get<Settings>(SETTINGS);
  configureApp(app);
  app.enableShutdownHooks();
  const server = await app.listen(settings.PORT, settings.HOST);
  server.requestTimeout = settings.OPENROUTER_TIMEOUT_MS + 30000;
  new Logger('Bootstrap').log(`Swagger: http://${settings.HOST}:${settings.PORT}/docs`);
}
void bootstrap().catch(() => { process.exitCode = 1; });
