import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ShortageTracker } from "./shortage-tracker";
import Redis from "ioredis";
import { restaurantId } from '../common/tenant/restaurant-context';
import { StopListReason } from "@prisma/client";
import { CommandBusService } from "../common/rabbitMQ/command-bus.service";
import { EXCHANGES, ROUTING_KEYS } from "../common/rabbitMQ/rabbitmq-topology";
import { REDIS_CLIENT } from "../common/redis/redis.module";
import {
  DishData,
  DishRecommendation,
  DishStatus,
  DishSuggestion,
  mapRawCatalogToDishes,
  mapRawInventoryToBatches,
  mapRawInventoryToStocks,
  ProductStock,
  RawCatalogDish,
  RawInventoryBatch,
  RecommendationBatch,
  RpcResponse,
} from "./types/recommendation.types";

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  private readonly lowStockLimit = 3;
  private readonly MS_IN_DAY = 1000 * 60 * 60 * 24;

  private readonly cacheTtl = Number(
    process.env.RECOMMENDATION_CACHE_TTL ?? 30,
  );

  private get CACHE_KEY_STATUSES() { return `recommendation:restaurant:${restaurantId()}:dish-statuses`; }
  private get CACHE_KEY_DISH_RECOMMENDATIONS() { return `recommendation:restaurant:${restaurantId()}:dish-recommendations`; }

  constructor(
    private readonly commandBusService: CommandBusService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly shortageTracker: ShortageTracker,
  ) {}

  async getStopListDishes(
    search?: string,
    forceRefresh = false,
  ): Promise<DishRecommendation[]> {
    const allRecommendations = await this.getDishStatuses(forceRefresh);

    const query = search?.trim().toLowerCase();

    console.log;
    return allRecommendations.filter(
      (dish) =>
        dish.status === "STOP_LIST" &&
        (!query || dish.dishName.toLowerCase().includes(query)),
    );
  }

  async getDishRecommendations(
    forceRefresh = false,
  ): Promise<DishSuggestion[]> {
    if (!forceRefresh) {
      const cached = await this.redis.get(this.CACHE_KEY_DISH_RECOMMENDATIONS);

      if (cached) {
        return JSON.parse(cached);
      }
    }

    const { dishes, batches } = await this.fetchBatchData();
    const result = this.calculateDishRecommendations(dishes, batches);

    await this.redis.set(
      this.CACHE_KEY_DISH_RECOMMENDATIONS,
      JSON.stringify(result),
      "EX",
      this.cacheTtl,
    );

    return result;
  }

  async getDishStatuses(forceRefresh = false): Promise<DishRecommendation[]> {
    if (!forceRefresh) {
      const cached = await this.redis.get(this.CACHE_KEY_STATUSES);

      if (cached) {
        return JSON.parse(cached);
      }
    }

    const result = await this.shortageTracker.reconcile(async () => {
      const { catalog, inventory } = await this.fetchRawData();
      const dishes = mapRawCatalogToDishes(catalog);
      const stocks = mapRawInventoryToStocks(inventory);
      const statuses = this.calculateRecommendations(dishes, stocks);
      const stockMap = new Map(stocks.map(stock => [stock.productId, stock.availableQuantity]));
      return { result: statuses, dishes: statuses.map(status => ({ dishId: status.dishId, status: status.status,
        products: (catalog.find(dish => dish.id === status.dishId)?.recipeItems ?? [])
          .filter(item => item.quantity > 0 && this.wholePortions(stockMap.get(item.productId) ?? 0, item.quantity) <= this.lowStockLimit)
          .map(item => ({ productId: item.productId, name: item.product?.name ?? `Продукт №${item.productId}`,
            unit: item.product?.unit ?? null })) })) };
    });

    await this.redis.set(
      this.CACHE_KEY_STATUSES,
      JSON.stringify(result),
      "EX",
      this.cacheTtl,
    );

    return result;
  }

  async invalidateCache(): Promise<void> {
    await this.redis.del(this.CACHE_KEY_STATUSES);
    await this.redis.del(this.CACHE_KEY_DISH_RECOMMENDATIONS);
  }

  async refreshAfterEvent(reason: string) {
    try {
      const statuses = await this.getDishStatuses(true);

      await this.getDishRecommendations(true).catch((err) => {
        this.logger.warn(
          `Не удалось пересчитать рекомендации после события ${reason}`,
          err,
        );
      });

      return {
        reason,
        updatedAt: new Date().toISOString(),
        stopList: statuses.filter((x) => x.status === "STOP_LIST"),
        statuses,
      };
    } catch (err) {
      this.logger.error(`Ошибка пересчёта после события ${reason}`, err);
      throw err;
    }
  }

  private async fetchRawData(): Promise<{
    catalog: RawCatalogDish[];
    inventory: RawInventoryBatch[];
  }> {
    try {
      const [catalogResponse, inventoryResponse] = await Promise.all([
        this.commandBusService.sendCommand(
          EXCHANGES.COMMANDS,
          ROUTING_KEYS.GET_DISHES,
          {},
        ) as Promise<RpcResponse<RawCatalogDish[]>>,
        this.commandBusService.sendCommand(
          EXCHANGES.COMMANDS,
          ROUTING_KEYS.GET_INVENTORY,
          {},
        ) as Promise<RpcResponse<RawInventoryBatch[]>>,
      ]);

      if (!catalogResponse.success || !inventoryResponse.success) {
        throw new Error("RPC returned success: false");
      }

      return {
        catalog: catalogResponse.data,
        inventory: inventoryResponse.data,
      };
    } catch (error) {
      throw new ServiceUnavailableException(
        "Не удалось получить данные из Catalog или Inventory",
      );
    }
  }

  private async fetchStockData() {
    const { catalog, inventory } = await this.fetchRawData();
    return {
      dishes: mapRawCatalogToDishes(catalog),
      stocks: mapRawInventoryToStocks(inventory),
    };
  }

  private async fetchBatchData() {
    const { catalog, inventory } = await this.fetchRawData();
    return {
      dishes: mapRawCatalogToDishes(catalog),
      batches: mapRawInventoryToBatches(inventory),
    };
  }
  ы;

  private wholePortions(quantity: number, quantityPerPortion: number): number {
    return quantityPerPortion > 0 ? Math.floor(quantity / quantityPerPortion + 1e-9) : 0;
  }

  private calculateRecommendations(
    dishes: DishData[],
    stocks: ProductStock[],
  ): DishRecommendation[] {
    const stockMap = new Map(stocks.map((stock) => [stock.productId, stock]));

    return dishes.map((dish) => {
      let maxPortions = dish.recipeItems.length ? Infinity : 0;
      const reasons = new Map<string, DishRecommendation["reasons"][number]>();

      for (const item of dish.recipeItems) {
        const stock = stockMap.get(item.productId);

        if (
          !stock ||
          stock.availableQuantity <= 0 ||
          item.quantityPerPortion <= 0
        ) {
          maxPortions = 0;
          this.addStopReason(
            reasons,
            StopListReason.INSUFFICIENT_STOCK,
            item.productId,
            item.productName,
          );
          continue;
        }

        const portions = this.wholePortions(stock.availableQuantity, item.quantityPerPortion);
        maxPortions = Math.min(maxPortions, portions);

        if (portions === 0) {
          this.addStopReason(
            reasons,
            StopListReason.INSUFFICIENT_STOCK,
            item.productId,
            item.productName,
          );

          // УДАЛЕНО: проверка stock.expiredQuantity > 0
          // Причина: новый InventoryService.getStock явно фильтрует
          // expiresAt: { gt: new Date() }, поэтому просроченные партии
          // сюда просто не попадают. Если товар закончился, причина всегда INSUFFICIENT_STOCK.
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
        reasons: status === "STOP_LIST" ? Array.from(reasons.values()) : [],
      };
    });
  }

  private addStopReason(
    reasons: Map<string, any>,
    status: StopListReason,
    productId: number,
    productName: string,
  ) {
    if (productName) {
      reasons.set(`${status}:${productId}`, {
        status,
        name: productName,
      });
    }
  }

  private calculateDishRecommendations(
    dishes: DishData[],
    batches: RecommendationBatch[],
  ): DishSuggestion[] {
    const now = new Date();

    const batchesByProduct = new Map<number, RecommendationBatch[]>();
    for (const batch of batches) {
      if (
        batch.status === "ACTIVE" &&
        batch.expiresAt > now &&
        batch.availableQuantity > 0
      ) {
        if (!batchesByProduct.has(batch.productId)) {
          batchesByProduct.set(batch.productId, []);
        }
        const productId = batch.productId;
        const existingBatches = batchesByProduct.get(productId) ?? [];
        existingBatches.push(batch);
        batchesByProduct.set(productId, existingBatches);
      }
    }

    const recommendations: DishSuggestion[] = [];

    for (const dish of dishes) {
      if (!dish.recipeItems.length || !dish.salePrice || dish.salePrice <= 0)
        continue;

      let maxPortions = Infinity;
      let costPrice = 0;
      let costKnown = true;
      let urgencyScore = 0;
      const expiringProducts = new Set<string>();

      for (const item of dish.recipeItems) {
        if (item.quantityPerPortion <= 0) {
          maxPortions = 0;
          break;
        }

        const productBatches = batchesByProduct.get(item.productId) || [];
        const totalQuantity = productBatches.reduce(
          (sum, b) => sum + b.availableQuantity,
          0,
        );
        const portions = this.wholePortions(totalQuantity, item.quantityPerPortion);

        maxPortions = Math.min(maxPortions, portions);
        if (portions === 0) continue;

        const hasUnknownPrice = productBatches.some((b) => b.price == null);
        if (hasUnknownPrice || productBatches.length === 0) {
          costKnown = false;
        } else {
          const totalCost = productBatches.reduce(
            (sum, b) => sum + b.price! * b.availableQuantity,
            0,
          );
          costPrice += (totalCost / totalQuantity) * item.quantityPerPortion;
        }
        let productUrgency = 0;
        for (const batch of productBatches) {
          const daysLeft =
            (batch.expiresAt.getTime() - now.getTime()) / this.MS_IN_DAY;
          if (daysLeft <= 1) {
            productUrgency += batch.availableQuantity / item.quantityPerPortion;
          } else if (daysLeft <= 3) {
            productUrgency +=
              (batch.availableQuantity / item.quantityPerPortion) * 0.5;
          }
        }

        if (productUrgency > 0) {
          expiringProducts.add(item.productName);
          urgencyScore += Math.min(productUrgency, 1);
        }
      }

      if (maxPortions < 1 || !Number.isFinite(maxPortions)) continue;

      const profit = costKnown ? dish.salePrice - costPrice : null;
      const profitMargin =
        profit !== null ? Math.max(0, Math.min(profit / dish.salePrice, 1)) : 0;
      const urgency = urgencyScore / dish.recipeItems.length;
      const recommendationScore =
        Math.round((urgency * 50 + profitMargin * 50) * 100) / 100;

      recommendations.push({
        dishId: dish.id,
        dishName: dish.name,
        salePrice: dish.salePrice,
        costPrice: costKnown ? Math.round(costPrice * 100) / 100 : null,
        profit: profit !== null ? Math.round(profit * 100) / 100 : null,
        maxPortions,
        expiringProducts: Array.from(expiringProducts),
        recommendationScore,
      });
    }

    return recommendations.sort(
      (a, b) => b.recommendationScore - a.recommendationScore,
    );
  }
}
