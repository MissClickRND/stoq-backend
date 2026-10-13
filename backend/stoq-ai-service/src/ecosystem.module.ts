import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { AiMessagingModule } from './messaging/ai-messaging.module';

@Module({ imports: [AppModule, AiMessagingModule] })
export class EcosystemModule {}
