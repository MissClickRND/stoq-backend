import { Controller, Get, Module } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SettingsModule } from "./config/settings.module";
import { UpdModule } from "./upd/upd.module";

@ApiTags("Health")
@Controller("ai/health")
class HealthController {
  @Get()
  @ApiOperation({ summary: "Проверка процесса (без обращения к OpenRouter)" })
  @ApiOkResponse({
    schema: {
      type: "object",
      properties: { status: { type: "string", example: "ok" } },
    },
  })
  health() {
    return { status: "ok" };
  }
}

@Module({
  imports: [SettingsModule, UpdModule],
  controllers: [HealthController],
})
export class AppModule {}
