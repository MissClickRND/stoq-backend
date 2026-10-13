import { BadGatewayException } from '@nestjs/common';
import type {
  DependencyGraph,
  DependencyStatus,
  IngredientGraphNode,
  CatalogGraphDish,
} from './dependency-graph.types';

const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const validName = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalidCatalog();

function parseCatalog(input: unknown): CatalogGraphDish[] {
  if (!Array.isArray(input)) return invalidCatalog();
  return input.map(value => {
    const dish = record(value);
    if (!validId(dish.id) || !validName(dish.name) || !Array.isArray(dish.recipeItems)) return invalidCatalog();
    return { id: dish.id, name: dish.name.trim(), recipeItems: dish.recipeItems.map(value => {
      const item = record(value);
      const product = record(item.product);
      const unit = record(product.unit);
      if (!validId(item.id) || !validId(item.productId) || !validId(product.id) ||
        (item.dishId !== undefined && !validId(item.dishId)) ||
        typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0 ||
        typeof item.stock !== 'number' || !Number.isFinite(item.stock) || item.stock < 0 ||
        !validName(product.name) || !validName(unit.shortName)) return invalidCatalog();
      return { id: item.id, productId: item.productId, dishId: item.dishId as number | undefined,
        quantity: item.quantity, stock: item.stock,
        product: { id: product.id, name: product.name.trim(), unit: { shortName: unit.shortName.trim() } } };
    }) };
  });
}

function invalidCatalog(): never {
  throw new BadGatewayException(
    'Каталог вернул некорректные данные для графа зависимостей',
  );
}

export function buildDependencyGraph(
  input: unknown,
  threshold = 5,
): DependencyGraph {
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 10000) {
    throw new Error('Некорректный порог DEPENDENCY_GRAPH_LOW_STOCK_PORTIONS');
  }
  const catalog = parseCatalog(input);
  const ingredients = new Map<
    number,
    { node: IngredientGraphNode; minPortions: number }
  >();
  const dishIds = new Set<number>();
  const recipeIds = new Set<number>();
  const dishes: DependencyGraph['nodes'] = [];
  const edges: DependencyGraph['edges'] = [];
  for (const dish of [...catalog].sort((a, b) => a.id - b.id)) {
    if (dishIds.has(dish.id)) return invalidCatalog();
    dishIds.add(dish.id);
    let dishStatus: DependencyStatus = dish.recipeItems.length
      ? 'available'
      : 'unavailable';
    for (const item of [...dish.recipeItems].sort((a, b) => a.id - b.id)) {
      if (
        recipeIds.has(item.id) ||
        item.product.id !== item.productId ||
        (item.dishId !== undefined && item.dishId !== dish.id)
      )
        return invalidCatalog();
      recipeIds.add(item.id);
      // Match catalog portion arithmetic at decimal boundaries such as 0.6 / 0.1.
      const portions = Math.floor(item.stock / item.quantity + 1e-9);
      const status: DependencyStatus =
        portions < 1
          ? 'unavailable'
          : portions <= threshold
            ? 'low_stock'
            : 'available';
      const name = item.product.name;
      const unit = item.product.unit.shortName;
      let ingredient = ingredients.get(item.productId);
      if (ingredient) {
        if (
          ingredient.node.data.quantity !== item.stock ||
          ingredient.node.data.name !== name ||
          ingredient.node.data.unit !== unit
        ) {
          return invalidCatalog();
        }
        ingredient.minPortions = Math.min(ingredient.minPortions, portions);
      } else {
        ingredient = {
          minPortions: portions,
          node: {
            id: `product:${item.productId}`,
            type: 'ingredient',
            data: { name, quantity: item.stock, unit, status: 'available' },
          },
        };
        ingredients.set(item.productId, ingredient);
      }
      ingredient.node.data.status =
        item.stock === 0
          ? 'out_of_stock'
          : ingredient.minPortions <= threshold
            ? 'low_stock'
            : 'available';
      edges.push({
        id: `recipe:${item.id}`,
        source: ingredient.node.id,
        target: `dish:${dish.id}`,
        data: { required: item.quantity, unit, status },
      });
      if (
        status === 'unavailable' ||
        (status === 'low_stock' && dishStatus === 'available')
      )
        dishStatus = status;
    }
    dishes.push({
      id: `dish:${dish.id}`,
      type: 'dish',
      data: { name: dish.name, status: dishStatus },
    });
  }
  return {
    nodes: [
      ...[...ingredients.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, entry]) => entry.node),
      ...dishes,
    ],
    edges: edges.sort((a, b) => Number(a.id.slice(7)) - Number(b.id.slice(7))),
  };
}
