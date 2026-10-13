import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";


async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    const swaggerConfig = new DocumentBuilder()
        .setTitle("Сервис заказов")
        .setDescription("HTTP API для работы с заказами.")
        .setVersion("1.0")
        .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup("api", app, swaggerDocument, {
        customSiteTitle: "Документация API сервиса остатков",
    });
    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
