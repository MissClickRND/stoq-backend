import "reflect-metadata";
import {
  Controller,
  Get,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { CommandBusModule } from "./common/rabbitMQ/command-bus.module";
import { Runtime } from "./runtime";
@Controller()
class HealthController {
  constructor(private readonly runtime: Runtime) {}
  @Get("health") async health() {
    try {
      return await this.runtime.health();
    } catch {
      throw new ServiceUnavailableException("Telegram database unavailable");
    }
  }
}
@Module({
  imports: [CommandBusModule],
  controllers: [HealthController],
  providers: [Runtime],
})
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "warn", "error"],
  });
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.PORT ?? 3007),
    process.env.HOST ?? "127.0.0.1",
  );
}
bootstrap().catch(() => {
  console.error("Telegram service startup failed");
  process.exitCode = 1;
});
