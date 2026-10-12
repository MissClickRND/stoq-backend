import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import "dotenv/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Сервис остатков")
    .setDescription("HTTP API для работы с остатками товаров.")
    .setVersion("1.0")
    .addTag("Поставки", "Операции с поставками товаров")
    .addTag("Остатки", "Операции с остатками товаров на складе")
    .addTag("Служебные", "Служебные методы приложения")
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup("api", app, swaggerDocument, {
    customSiteTitle: "Документация API сервиса остатков",
  });

  await app.listen(process.env.PORT ?? 3003);
}
void bootstrap();
