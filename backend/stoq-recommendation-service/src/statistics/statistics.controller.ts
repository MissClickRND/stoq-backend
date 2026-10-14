import { Controller, Get } from "@nestjs/common";
import { StatisticsService } from "./statistics.service";
import { ApiOkResponse, ApiOperation } from "@nestjs/swagger";

@Controller("statistics")
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @ApiOperation({ summary: "Получить статистику для блюд" })
  @ApiOkResponse({ description: "Статистика по блюдам" })
  @Get("dishes")
  getDishesStatistics() {
    return this.statisticsService.getDishesStatistics();
  }

  @ApiOperation({ summary: "Получить статистику заказов за сегодня" })
  @ApiOkResponse({ description: "Статистика заказов за сегодня" })
  @Get("orders/today")
  getOrdersTodayStatistics() {
    return this.statisticsService.getOrdersTodayStatistics();
  }
}
