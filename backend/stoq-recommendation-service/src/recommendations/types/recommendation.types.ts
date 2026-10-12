export type DishStatus = 'AVAILABLE' | 'LOW_STOCK' | 'STOP_LIST';

export interface RecipeIngredient {
  productId: string;
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
  productId: string;
  availableQuantity: number;
  expiringQuantity: number;
}

export interface DishRecommendation {
  dishId: number;
  dishName: string;
  salePrice: number | null;
  status: DishStatus;
  maxPortions: number;
  priority: number;
  reasons: string[];
}
