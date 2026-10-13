export type DependencyStatus = 'available' | 'low_stock' | 'unavailable';
export type IngredientStatus = 'available' | 'low_stock' | 'out_of_stock';
export type IngredientGraphNode = { id: string; type: 'ingredient';
  data: { name: string; quantity: number; unit: string; status: IngredientStatus } };
export type DishGraphNode = { id: string; type: 'dish'; data: { name: string; status: DependencyStatus } };
export type DependencyGraph = { nodes: (IngredientGraphNode | DishGraphNode)[];
  edges: { id: string; source: string; target: string; data: { required: number; unit: string; status: DependencyStatus } }[] };

export type CatalogGraphDish = { id: number; name: string; recipeItems: {
  id: number; productId: number; dishId?: number; quantity: number; stock: number;
  product: { id: number; name: string; unit: { shortName: string } };
}[] };
