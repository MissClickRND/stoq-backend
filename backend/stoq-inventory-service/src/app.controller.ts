import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AppService } from "./app.service";

@ApiTags("Служебные")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: "Проверить доступность сервиса" })
  @ApiOkResponse({ description: "Сервис доступен" })
  getHello(): string {
    return this.appService.getHello();
  }
}
