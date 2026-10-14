import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { StopListReason } from "@prisma/client";
import { CommandBusService } from "../common/rabbitMQ/command-bus.service";
import { EXCHANGES, ROUTING_KEYS } from "../common/rabbitMQ/rabbitmq-topology";
import {
    DishData,
    DishRecommendation,
    DishStatus,
    DishSuggestion,
    ProductStock,
    RecommendationBatch,
} from "./types/recommendation.types";

@Injectable()
export class RecommendationService {
    private readonly lowStockLimit = 3;

    constructor(private readonly commandBusService: CommandBusService) {}

    async getStopListFromServices(
        search?: string,
    ): Promise<DishRecommendation[]> {
        try {
            const [catalogResponse, inventoryResponse] = await Promise.all([
                this.commandBusService.sendCommand<RpcResponse<CatalogDish[]>>(
                    EXCHANGES.COMMANDS,
                    ROUTING_KEYS.GET_DISHES,
                    {},
                ),
                this.commandBusService.sendCommand<
                    RpcResponse<InventoryBatch[]>
                >(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_INVENTORY, {}),
            ]);

            if (!catalogResponse.success || !inventoryResponse.success) {
                throw new Error("Catalog or Inventory returned an RPC error");
            }

            const dishes: DishData[] = catalogResponse.data.map((dish) => ({
                id: dish.id,
                name: dish.name,
                salePrice: dish.salePrice,
                recipeItems: dish.recipeItems.map((item) => ({
                    productId: item.productId,
                    productName:
                        item.product?.name?.trim() ||
                        `Продукт ${item.productId}`,
                    quantityPerPortion: item.quantity,
                })),
            }));

            const stocksByProduct = new Map<number, ProductStock>();
            const now = Date.now();

            for (const batch of inventoryResponse.data) {
                const stock = stocksByProduct.get(batch.productId) ?? {
                    productId: batch.productId,
                    availableQuantity: 0,
                    expiredQuantity: 0,
                };
                const quantity = batch.balance?.availableQuantity;
                const expiresAt = Date.parse(batch.expiresAt);

                if (
                    typeof quantity !== "number" ||
                    !Number.isFinite(quantity) ||
                    quantity < 0 ||
                    Number.isNaN(expiresAt)
                ) {
                    stocksByProduct.set(batch.productId, stock);
                    continue;
                }

                if (expiresAt <= now) {
                    stock.expiredQuantity += quantity;
                } else {
                    stock.availableQuantity += quantity;
                }

                stocksByProduct.set(batch.productId, stock);
            }

            return this.getStopList(
                dishes,
                [...stocksByProduct.values()],
                search,
            );
        } catch {
            throw new ServiceUnavailableException(
                "Не удалось получить данные из Catalog или Inventory через RabbitMQ",
            );
        }
    }

    async getDishRecommendationsFromServices(): Promise<DishSuggestion[]> {
        try {
            const [catalogResponse, inventoryResponse] = await Promise.all([
                this.commandBusService.sendCommand<RpcResponse<CatalogDish[]>>(
                    EXCHANGES.COMMANDS,
                    ROUTING_KEYS.GET_DISHES,
                    {},
                ),
                this.commandBusService.sendCommand<
                    RpcResponse<InventoryBatch[]>
                >(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_INVENTORY, {}),
            ]);

            if (!catalogResponse.success || !inventoryResponse.success) {
                throw new Error("Catalog or Inventory returned an RPC error");
            }

            const dishes: DishData[] = catalogResponse.data.map((dish) => ({
                id: dish.id,
                name: dish.name,
                salePrice: dish.salePrice,
                recipeItems: dish.recipeItems.map((item) => ({
                    productId: item.productId,
                    productName:
                        item.product?.name?.trim() ||
                        `Продукт ${item.productId}`,
                    quantityPerPortion: item.quantity,
                })),
            }));

            const batches: RecommendationBatch[] = inventoryResponse.data
                .filter(
                    (batch) =>
                        Number.isFinite(batch.productId) &&
                        Number.isFinite(batch.availableQuantity) &&
                        Number.isFinite(Date.parse(batch.expiresAt)),
                )
                .map((batch) => ({
                    productId: batch.productId,
                    availableQuantity: Number(batch.availableQuantity),
                    price:
                        typeof batch.price === "number" &&
                        Number.isFinite(batch.price)
                            ? batch.price
                            : null,
                    expiresAt: new Date(batch.expiresAt),
                    status:
                        batch.status === "ACTIVE" ||
                        batch.status === "DEPLETED" ||
                        batch.status === "EXPIRED" ||
                        batch.status === "QUARANTINED"
                            ? batch.status
                            : "DEPLETED",
                }));

            return this.calculateDishRecommendations(dishes, batches);
        } catch {
            throw new ServiceUnavailableException(
                "Не удалось получить данные из Catalog или Inventory через RabbitMQ",
            );
        }
    }

    calculateRecommendations(
        dishes: DishData[],
        stocks: ProductStock[],
    ): DishRecommendation[] {
        const stockMap = new Map(
            stocks.map((stock) => [stock.productId, stock]),
        );

        return dishes.map((dish) => {
            let maxPortions = dish.recipeItems.length ? Infinity : 0;
            const reasons = new Map<
                string,
                DishRecommendation["reasons"][number]
            >();

            for (const item of dish.recipeItems) {
                const stock = stockMap.get(item.productId);
                const productName = item.productName.trim();

                if (
                    !stock ||
                    !Number.isFinite(item.quantityPerPortion) ||
                    item.quantityPerPortion <= 0 ||
                    !Number.isFinite(stock.availableQuantity) ||
                    stock.availableQuantity < 0
                ) {
                    maxPortions = 0;

                    if (productName) {
                        reasons.set(
                            `${StopListReason.INSUFFICIENT_STOCK}:${item.productId}`,
                            {
                                status: StopListReason.INSUFFICIENT_STOCK,
                                name: productName,
                            },
                        );
                    }
                    continue;
                }

                const portions = Math.floor(
                    stock.availableQuantity / item.quantityPerPortion,
                );
                maxPortions = Math.min(maxPortions, portions);

                if (portions === 0 && productName) {
                    reasons.set(
                        `${StopListReason.INSUFFICIENT_STOCK}:${item.productId}`,
                        {
                            status: StopListReason.INSUFFICIENT_STOCK,
                            name: productName,
                        },
                    );

                    if (stock.expiredQuantity > 0) {
                        reasons.set(
                            `${StopListReason.EXPIRED_INGREDIENT}:${item.productId}`,
                            {
                                status: StopListReason.EXPIRED_INGREDIENT,
                                name: productName,
                            },
                        );
                    }
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
                maxPortions: Number.isFinite(maxPortions) ? maxPortions : 0,
                priority: 0,
                reasons: status === "STOP_LIST" ? [...reasons.values()] : [],
            };
        });
    }

    getStopList(
        dishes: DishData[],
        stocks: ProductStock[],
        search?: string,
    ): DishRecommendation[] {
        const query = search?.trim().toLowerCase();

        return this.calculateRecommendations(dishes, stocks).filter(
            (dish) =>
                dish.status === "STOP_LIST" &&
                (!query || dish.dishName.toLowerCase().includes(query)),
        );
    }

    calculateDishRecommendations(
        dishes: DishData[],
        batches: RecommendationBatch[],
    ): DishSuggestion[] {
        const now = new Date();

        const availableBatches = batches.filter(
            (batch) =>
                batch.status === "ACTIVE" &&
                new Date(batch.expiresAt) > now &&
                batch.availableQuantity > 0,
        );

        const recommendations: DishSuggestion[] = [];

        for (const dish of dishes) {
            if (
                !dish.recipeItems.length ||
                dish.salePrice == null ||
                Number(dish.salePrice) <= 0
            ) {
                continue;
            }

            let maxPortions = Infinity;
            let costPrice = 0;
            let costKnown = true;
            let urgencyScore = 0;

            const expiringProducts = new Set<string>();

            for (const item of dish.recipeItems) {
                const quantityPerPortion = Number(item.quantityPerPortion);

                if (
                    !Number.isFinite(quantityPerPortion) ||
                    quantityPerPortion <= 0
                ) {
                    maxPortions = 0;
                    break;
                }

                const productBatches = availableBatches.filter(
                    (batch) => batch.productId === item.productId,
                );

                const totalQuantity = productBatches.reduce(
                    (sum, batch) => sum + Number(batch.availableQuantity),
                    0,
                );

                const portions = Math.floor(totalQuantity / quantityPerPortion);

                maxPortions = Math.min(maxPortions, portions);

                if (portions === 0) {
                    continue;
                }

                const hasUnknownPrice = productBatches.some(
                    (batch) => batch.price == null,
                );

                if (hasUnknownPrice || productBatches.length === 0) {
                    costKnown = false;
                } else {
                    const totalCost = productBatches.reduce(
                        (sum, batch) =>
                            sum +
                            Number(batch.price) *
                                Number(batch.availableQuantity),
                        0,
                    );

                    costPrice +=
                        (totalCost / totalQuantity) * quantityPerPortion;
                }

                let productUrgency = 0;

                for (const batch of productBatches) {
                    const expiresAt = new Date(batch.expiresAt);
                    const daysLeft =
                        (expiresAt.getTime() - now.getTime()) /
                        (1000 * 60 * 60 * 24);

                    if (daysLeft <= 1) {
                        productUrgency +=
                            Number(batch.availableQuantity) /
                            quantityPerPortion;
                    } else if (daysLeft <= 3) {
                        productUrgency +=
                            (Number(batch.availableQuantity) /
                                quantityPerPortion) *
                            0.5;
                    }
                }

                if (productUrgency > 0) {
                    expiringProducts.add(item.productName);
                    urgencyScore += Math.min(productUrgency, 1);
                }
            }

            if (maxPortions < 1 || !Number.isFinite(maxPortions)) {
                continue;
            }

            const salePrice = Number(dish.salePrice);
            const profit = costKnown ? salePrice - costPrice : null;

            const profitMargin =
                profit !== null
                    ? Math.max(0, Math.min(profit / salePrice, 1))
                    : 0;

            const urgency = urgencyScore / dish.recipeItems.length;

            const recommendationScore =
                Math.round((urgency * 50 + profitMargin * 50) * 100) / 100;

            recommendations.push({
                dishId: dish.id,
                dishName: dish.name,
                salePrice,
                costPrice: costKnown ? Math.round(costPrice * 100) / 100 : null,
                profit: profit !== null ? Math.round(profit * 100) / 100 : null,
                maxPortions,
                expiringProducts: [...expiringProducts],
                recommendationScore,
            });
        }

        return recommendations.sort(
            (a, b) => b.recommendationScore - a.recommendationScore,
        );
    }

    async getDishStatusesFromServices(): Promise<DishRecommendation[]> {
        try {
            const [catalogResponse, inventoryResponse] = await Promise.all([
                this.commandBusService.sendCommand<RpcResponse<CatalogDish[]>>(
                    EXCHANGES.COMMANDS,
                    ROUTING_KEYS.GET_DISHES,
                    {},
                ),
                this.commandBusService.sendCommand<
                    RpcResponse<InventoryBatch[]>
                >(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_INVENTORY, {}),
            ]);

            if (!catalogResponse.success || !inventoryResponse.success) {
                throw new Error("Catalog or Inventory returned an RPC error");
            }

            const dishes: DishData[] = catalogResponse.data.map((dish) => ({
                id: dish.id,
                name: dish.name,
                salePrice: dish.salePrice,
                recipeItems: dish.recipeItems.map((item) => ({
                    productId: item.productId,
                    productName:
                        item.product?.name?.trim() ||
                        `Продукт ${item.productId}`,
                    quantityPerPortion: item.quantity,
                })),
            }));

            const stocksByProduct = new Map<number, ProductStock>();
            const now = Date.now();

            for (const batch of inventoryResponse.data) {
                const stock = stocksByProduct.get(batch.productId) ?? {
                    productId: batch.productId,
                    availableQuantity: 0,
                    expiredQuantity: 0,
                };

                const quantity = batch.balance?.availableQuantity;
                const expiresAt = Date.parse(batch.expiresAt);

                if (
                    typeof quantity !== "number" ||
                    !Number.isFinite(quantity) ||
                    quantity < 0 ||
                    Number.isNaN(expiresAt)
                ) {
                    stocksByProduct.set(batch.productId, stock);
                    continue;
                }

                if (expiresAt <= now) {
                    stock.expiredQuantity += quantity;
                } else {
                    stock.availableQuantity += quantity;
                }

                stocksByProduct.set(batch.productId, stock);
            }

            return this.calculateRecommendations(dishes, [
                ...stocksByProduct.values(),
            ]);
        } catch {
            throw new ServiceUnavailableException(
                "Не удалось получить данные из Catalog или Inventory через RabbitMQ",
            );
        }
    }
}

interface RpcResponse<T> {
    success: boolean;
    data: T;
}

interface CatalogDish {
    id: number;
    name: string;
    salePrice: number | null;
    recipeItems: Array<{
        productId: number;
        quantity: number;
        product?: { name?: string };
    }>;
}

interface InventoryBatch {
    productId: number;
    expiresAt: string;
    availableQuantity?: number;
    price?: number | null;
    status?: string;
    balance?: { availableQuantity: number } | null;
}
