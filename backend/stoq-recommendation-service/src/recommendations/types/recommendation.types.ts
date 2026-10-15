import { StopListReason } from "@prisma/client";

export interface RpcResponse<T> {
  success: boolean;
  data: T;
}

export interface RawCatalogDish {
  id: number;
  name: string;
  salePrice: number | null;
  recipeItems: Array<{
    productId: number;
    quantity: number;
    product?: { name?: string; unit?: { id: number; name: string; shortName: string } };
  }>;
}

export interface RawInventoryBatch {
  productId: number;
  expiresAt: string;
  availableQuantity?: number;
  price?: number | null;
  status?: string;
  balance?: { availableQuantity: number } | null;
}

export type DishStatus = "AVAILABLE" | "LOW_STOCK" | "STOP_LIST";
export type BatchStatus = "ACTIVE" | "DEPLETED" | "EXPIRED" | "QUARANTINED";

export interface RecipeIngredient {
  productId: number;
  productName: string;
  quantityPerPortion: number;
}

export interface DishData {
  id: number;
  name: string;
  salePrice: number | null;
  recipeItems: RecipeIngredient[];
}

export interface ProductStock {
  productId: number;
  availableQuantity: number;
  expiredQuantity: number;
}

export interface RecommendationBatch {
  productId: number;
  availableQuantity: number;
  price: number | null;
  expiresAt: Date;
  status: BatchStatus;
}

export interface RecommendationReason {
  status: StopListReason;
  name: string;
}

export interface DishRecommendation {
  dishId: number;
  dishName: string;
  salePrice: number | null;
  status: DishStatus;
  maxPortions: number;
  priority: number;
  reasons: RecommendationReason[];
}

export interface DishSuggestion {
  dishId: number;
  dishName: string;
  salePrice: number;
  costPrice: number | null;
  profit: number | null;
  maxPortions: number;
  expiringProducts: string[];
  recommendationScore: number;
}

export function mapRawCatalogToDishes(rawDishes: RawCatalogDish[]): DishData[] {
  return rawDishes.map((dish) => ({
    id: dish.id,
    name: dish.name,
    salePrice: dish.salePrice,
    recipeItems: dish.recipeItems.map((item) => ({
      productId: item.productId,
      productName: item.product?.name?.trim() || `Продукт ${item.productId}`,
      quantityPerPortion: item.quantity,
    })),
  }));
}

export function mapRawInventoryToStocks(
  rawBatches: RawInventoryBatch[],
): ProductStock[] {
  const stocksByProduct = new Map<number, ProductStock>();
  const now = Date.now();

  for (const batch of rawBatches) {
    const quantity =
      batch.balance?.availableQuantity ?? batch.availableQuantity ?? 0;
    const expiresAt = Date.parse(batch.expiresAt);

    if (typeof quantity !== "number" || Number.isNaN(expiresAt)) {
      continue;
    }

    const stock = stocksByProduct.get(batch.productId) ?? {
      productId: batch.productId,
      availableQuantity: 0,
      expiredQuantity: 0,
    };

    if (expiresAt <= now) {
      stock.expiredQuantity += quantity;
    } else {
      stock.availableQuantity += quantity;
    }

    stocksByProduct.set(batch.productId, stock);
  }

  return Array.from(stocksByProduct.values());
}

export function mapRawInventoryToBatches(
  rawBatches: RawInventoryBatch[],
): RecommendationBatch[] {
  const validStatuses: BatchStatus[] = [
    "ACTIVE",
    "DEPLETED",
    "EXPIRED",
    "QUARANTINED",
  ];

  return rawBatches
    .filter((batch) => {
      const hasQuantity =
        batch.availableQuantity != null ||
        batch.balance?.availableQuantity != null;
      return batch.productId && hasQuantity && batch.expiresAt;
    })
    .map((batch) => {
      const rawStatus = batch.status as BatchStatus;

      const availableQuantity =
        batch.balance?.availableQuantity ?? batch.availableQuantity ?? 0;

      return {
        productId: batch.productId,
        availableQuantity: Number(availableQuantity),
        price: typeof batch.price === "number" ? batch.price : null,
        expiresAt: new Date(batch.expiresAt),
        status: validStatuses.includes(rawStatus) ? rawStatus : "ACTIVE",
      };
    });
}
