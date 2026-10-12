import { Injectable } from "@nestjs/common";
import {
    DishData,
    DishRecommendation,
    DishStatus,
    ProductStock,
} from "./types/recommendation.types";

@Injectable()
export class RecommendationService {
    private readonly lowStockLimit = 3;

    calculateRecommendations(
        dishes: DishData[],
        stocks: ProductStock[],
    ): DishRecommendation[] {
        const stockMap = new Map(
            stocks.map((stock) => [stock.productId, stock]),
        );

        const calculated = dishes.map((dish) => {
            let maxPortions = Infinity;
            const reasons: string[] = [];

            if (dish.recipeItems.length === 0) {
                maxPortions = 0;
                reasons.push("NO_RECIPE");
            }

            for (const ingredient of dish.recipeItems) {
                const stock = stockMap.get(ingredient.productId);

                if (!stock) {
                    maxPortions = 0;
                    reasons.push(`NO_STOCK_DATA:${ingredient.productName}`);
                    continue;
                }

                if (ingredient.quantityPerPortion <= 0) {
                    maxPortions = 0;
                    reasons.push(`INVALID_RECIPE:${ingredient.productName}`);
                    continue;
                }

                const portions = Math.floor(
                    stock.availableQuantity / ingredient.quantityPerPortion,
                );

                maxPortions = Math.min(maxPortions, portions);

                if (portions === 0) {
                    reasons.push(
                        `INSUFFICIENT_STOCK:${ingredient.productName}`,
                    );
                }

                if (stock.expiringQuantity > 0) {
                    reasons.push(
                        `USES_EXPIRING_INGREDIENTS:${ingredient.productName}`,
                    );
                }
            }

            const status: DishStatus =
                maxPortions === 0
                    ? "STOP_LIST"
                    : maxPortions <= this.lowStockLimit
                        ? "LOW_STOCK"
                        : "AVAILABLE";

            return {
                dishId: dish.id,
                dishName: dish.name,
                salePrice: dish.salePrice,
                status,
                maxPortions,
                reasons: [...new Set(reasons)],
            };
        });

        const sellable = calculated.filter(
            (dish) => dish.status !== "STOP_LIST",
        );

        const maxPortionsAcrossDishes = Math.max(
            1,
            ...sellable.map((dish) => dish.maxPortions),
        );

        const prices = sellable
            .map((dish) => dish.salePrice)
            .filter((price): price is number => price !== null);

        const minPrice = prices.length ? Math.min(...prices) : 0;
        const maxPrice = prices.length ? Math.max(...prices) : 0;

        return calculated
            .map((dish) => {
                if (dish.status === "STOP_LIST") {
                    return { ...dish, priority: 0 };
                }

                const source = dishes.find((item) => item.id === dish.dishId)!;

                const expiringScore = Math.min(
                    100,
                    source.recipeItems.reduce((score, ingredient) => {
                        const stock = stockMap.get(ingredient.productId);

                        if (!stock || ingredient.quantityPerPortion <= 0) {
                            return score;
                        }

                        const expiringPortions = Math.floor(
                            stock.expiringQuantity /
                                ingredient.quantityPerPortion,
                        );

                        return Math.max(
                            score,
                            (Math.min(expiringPortions, dish.maxPortions) /
                                Math.max(1, dish.maxPortions)) *
                                100,
                        );
                    }, 0),
                );

                const stockScore =
                    (dish.maxPortions / maxPortionsAcrossDishes) * 100;

                const priceScore =
                    dish.salePrice !== null && maxPrice > minPrice
                        ? ((dish.salePrice - minPrice) /
                              (maxPrice - minPrice)) * 100 : 0;

                const priority = Math.round(
                    expiringScore * 0.5 + stockScore * 0.3 + priceScore * 0.2,
                );

                return { ...dish, priority };
            })
            .sort(
                (a, b) =>
                    b.priority - a.priority ||
                    (b.salePrice ?? 0) - (a.salePrice ?? 0),
            );
    }

    getStopList(
        dishes: DishData[],
        stocks: ProductStock[],
    ): DishRecommendation[] {
        return this.calculateRecommendations(dishes, stocks).filter(
            (dish) => dish.status === "STOP_LIST",
        );
    }
}
