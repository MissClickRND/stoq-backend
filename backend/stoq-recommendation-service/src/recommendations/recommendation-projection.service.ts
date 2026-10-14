import { Injectable, OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { CommandBusService } from "../common/rabbitMQ/command-bus.service";
import { EventBusService } from "../common/rabbitMQ/event-bus.service";
import { EXCHANGES, ROUTING_KEYS } from "../common/rabbitMQ/rabbitmq-topology";
import { RecommendationService } from "./recommendations.service";
import {
  DishData,
  DishRecommendation,
  ProductStock,
} from "./types/recommendation.types";

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
  balance: { availableQuantity: number } | null;
}

interface RpcResponse<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class RecommendationProjectionService implements OnModuleInit {
  private dishes: DishData[] = [];
  private stocksByProduct = new Map<number, ProductStock>();
  private stopList: DishRecommendation[] = [];
  private statuses: DishRecommendation[] = [];
  private lastUpdatedAt: string | null = null;

  constructor(
    private readonly commandBusService: CommandBusService,
    private readonly eventBusService: EventBusService,
    private readonly recommendationService: RecommendationService,
  ) {}

  async onModuleInit() {
    await this.loadInitialSnapshot();
  }

  private async loadInitialSnapshot(): Promise<void> {
    try {
      const [catalogResponse, inventoryResponse] = await Promise.all([
        this.commandBusService.sendCommand<RpcResponse<CatalogDish[]>>(
          EXCHANGES.COMMANDS,
          ROUTING_KEYS.GET_DISHES,
          {},
        ),
        this.commandBusService.sendCommand<RpcResponse<InventoryBatch[]>>(
          EXCHANGES.COMMANDS,
          ROUTING_KEYS.GET_INVENTORY,
          {},
        ),
      ]);

      if (!catalogResponse.success || !inventoryResponse.success) {
        console.error("Failed to load initial snapshot");
        return;
      }

      this.applyCatalogSnapshot(catalogResponse.data);
      this.applyInventorySnapshot(inventoryResponse.data);
    } catch (error) {
      console.error("Error loading initial snapshot:", error);
    }
  }

  applyCatalogSnapshot(catalogDishes: CatalogDish[]): void {
    this.dishes = catalogDishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      salePrice: dish.salePrice,
      recipeItems: dish.recipeItems.map((item) => ({
        productId: item.productId,
        productName: item.product?.name?.trim() || `Продукт ${item.productId}`,
        quantityPerPortion: item.quantity,
      })),
    }));

    this.recalculate();
  }

  
  applyInventorySnapshot(batches: InventoryBatch[]): void {
    const stocksByProduct = new Map<number, ProductStock>();
    const now = Date.now();

    for (const batch of batches) {
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

    this.stocksByProduct = stocksByProduct;
    this.recalculate();
  }

  @Interval(3600)
  handlePeriodicRecalculation(): void {
    this.recalculate();
  }

  private recalculate(): void {
    const stocks = [...this.stocksByProduct.values()];

    this.statuses = this.recommendationService.calculateRecommendations(
      this.dishes,
      stocks,
    );

    this.stopList = this.statuses.filter((item) => item.status === "STOP_LIST");

    this.lastUpdatedAt = new Date().toISOString();

    this.publishUpdate();
  }

  private publishUpdate(): void {
    this.eventBusService.publish(
      EXCHANGES.EVENTS,
      ROUTING_KEYS.RECOMMENDATION_UPDATED,
      {
        generatedAt: this.lastUpdatedAt,
        stopList: this.stopList,
        statuses: this.statuses,
      },
      "recommendation-service",
    );
  }

  getStopList(search?: string): DishRecommendation[] {
    const query = search?.trim().toLowerCase();

    return this.stopList.filter(
      (dish) => !query || dish.dishName.toLowerCase().includes(query),
    );
  }

  getStatuses(): DishRecommendation[] {
    return this.statuses;
  }
}
