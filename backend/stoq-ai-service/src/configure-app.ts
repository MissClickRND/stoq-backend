import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/http-exception.filter';

export function configureApp(app: INestApplication): void {
  app.useGlobalFilters(new HttpExceptionFilter());
  const swagger = new DocumentBuilder()
    .setTitle('STOQ AI Service — распознавание УПД')
    .setDescription('Загрузите УПД через POST /ai → Try it out → file → Execute. В экосистеме используйте этот же маршрут через stoq-gate. Нечитаемые поля — null. Если настроен SERVICE_API_KEY, укажите его в Authorize.')
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Service-Key' }, 'serviceKey')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger), { jsonDocumentUrl: 'docs-json' });
}
