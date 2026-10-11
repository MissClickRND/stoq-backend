import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // const swaggerConfig = new DocumentBuilder()
  //   .setTitle("Сервис каталога")
  //   .setDescription("HTTP API для работы с каталогом продуктов.")
  //   .setVersion("1.0")
  //   .addTag("Товары", "Операции с товарами каталога")
  //   .addTag("Служебные", "Служебные методы приложения")
  //   .build();
  // const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  // SwaggerModule.setup("api", app, swaggerDocument, {
  //   customSiteTitle: "Документация API сервиса каталога",
  // });

  await app.listen(process.env.PORT ?? 3002);
}
bootstrap();
