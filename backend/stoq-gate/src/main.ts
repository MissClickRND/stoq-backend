import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { corsOptions } from './cors-options';
import cookieParser from 'cookie-parser';
import { AuthService } from './auth/auth.service';
import { AuthIoAdapter } from './auth/auth-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useWebSocketAdapter(new AuthIoAdapter(app, app.get(AuthService)));

  app.enableCors(corsOptions);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const swaggerConfig = new DocumentBuilder().setTitle('STOQ API Gateway').setDescription('Авторизация, каталог, поставки, склад, заказы и AI распознавание УПД через POST /ai').setVersion('1.0').addCookieAuth('accessToken').addBearerAuth().build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api', app, swaggerDocument, {
    customSiteTitle: 'STOQ API Gateway',
  });

  app.enableShutdownHooks();
  const server = await app.listen(process.env.PORT ?? 3000);
  server.requestTimeout = Number(process.env.AI_RPC_TIMEOUT_MS ?? 150000) + 30000;
}
bootstrap();
