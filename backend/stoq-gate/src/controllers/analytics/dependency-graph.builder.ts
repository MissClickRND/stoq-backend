import { BadGatewayException } from '@nestjs/common';
import { z } from 'zod';
import type {
  DependencyGraphResponseDto,
  DependencyStatus,
  IngredientGraphNodeDto,
} from './dependency-graph.dto';

const id = z.number().int().positive();
const catalogSchema = z.array(
  z.object({
    id,
    name: z.string().trim().min(1),
    recipeItems: z.array(
      z.object({
        id,
        productId: id,
        dishId: id.optional(),
        quantity: z.number().positive(),
        stock: z.number().nonnegative(),
        product: z.object({
          id,
          name: z.string().trim().min(1),
          unit: z.object({ shortName: z.string().trim().min(1) }),
        }),
      }),
    ),
  }),
);

function invalidCatalog(): never {
  throw new BadGatewayException(
    'Каталог вернул некорректные данные для графа зависимостей',
  );
}

export function buildDependencyGraph(
  input: unknown,
  threshold = 5,
): DependencyGraphResponseDto {
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 10000) {
    throw new Error('Некорректный порог DEPENDENCY_GRAPH_LOW_STOCK_PORTIONS');
  }
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success) return invalidCatalog();
  const ingredients = new Map<
    number,
    { node: IngredientGraphNodeDto; minPortions: number }
  >();
  const dishIds = new Set<number>();
  const recipeIds = new Set<number>();
  const dishes: DependencyGraphResponseDto['nodes'] = [];
  const edges: DependencyGraphResponseDto['edges'] = [];
  for (const dish of [...parsed.data].sort((a, b) => a.id - b.id)) {
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
