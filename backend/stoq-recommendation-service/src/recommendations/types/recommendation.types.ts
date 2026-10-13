export type DishStatus = "AVAILABLE" | "LOW_STOCK" | "STOP_LIST";
import { StopListReason } from "@prisma/client";

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

export interface DishRecommendation {
  dishId: number;
  dishName: string;
  salePrice: number | null;
  status: DishStatus;
  maxPortions: number;
  priority: number;
  reasons: RecommendationReason[];
}

export interface RecommendationReason {
  status: StopListReason;
  name: string;
}

export interface RecommendationBatch {
  productId: number;
  availableQuantity: number;
  price: number | null;
  expiresAt: Date;
  status: "ACTIVE" | "DEPLETED" | "EXPIRED" | "QUARANTINED";
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
