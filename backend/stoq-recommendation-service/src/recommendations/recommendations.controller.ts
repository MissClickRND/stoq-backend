import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { RecommendationService } from "./recommendations.service";

@ApiTags("Recommendations")
@Controller("recommendations")
export class RecommendationsController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @ApiOperation({ summary: "Получить стоп-лист блюд" })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Подстрока для поиска блюда в стоп-листе",
    example: "беф",
  })
  @ApiOkResponse({ description: "Стоп-лист" })
  @Get("stop-list")
  findAll(@Query("search") search?: string) {
    return this.recommendationService.getStopListDishes(search);
  }

  @ApiOperation({ summary: "Получить приоритетные блюда для приготовления" })
  @ApiOkResponse({ description: "Рекомендации по приготовлению блюд" })
  @Get("dishes")
  getDishRecommendations() {
    return this.recommendationService.getDishRecommendations();
  }
}
