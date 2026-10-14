import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AllExceptionFilter } from './common/filters/all-exeption.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
  );
  app.useGlobalFilters(new AllExceptionFilter());

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, 
      forbidNonWhitelisted: true, 
      transform: true, 
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('API')
    .setDescription('CRM API')
    .setVersion('1.0')
    .addCookieAuth('accessToken')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.enableCors({
    credentials: true,
    origin: 'http://localhost:5173',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
