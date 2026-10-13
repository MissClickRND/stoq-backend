import { Injectable } from "@nestjs/common";
import { RecommendationService } from "../recommendations/recommendations.service";

@Injectable()
export class StatisticsService {
    constructor(
        private readonly recommendationService: RecommendationService,
    ) {}

    async getDishesStatistics() {
        const dishes =
            await this.recommendationService.getDishStatusesFromServices();

        return {
            total: dishes.length,
            active: dishes.filter((dish) => dish.status === "AVAILABLE").length,
            lowStock: dishes.filter((dish) => dish.status === "LOW_STOCK").length,
            stopList: dishes.filter((dish) => dish.status === "STOP_LIST").length,
        };
    }
}
