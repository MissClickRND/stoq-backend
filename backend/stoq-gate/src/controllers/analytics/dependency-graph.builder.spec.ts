describe('Dependency graph contract', () => {
  let buildGraph: (input: unknown, threshold?: number) => any;
  const recipe = (id: number, productId: number, name: string, stock: number, quantity: number) => ({
    id, productId, dishId: 11, quantity, stock, product: { id: productId, name, unit: { shortName: 'кг' } },
  });
  const dish = { id: 11, name: 'Паста Маринара', recipeItems: [
    recipe(1, 1, 'Помидоры', 0, 0.15), recipe(2, 2, 'Базилик', 0.05, 0.01), recipe(3, 3, 'Спагетти', 12, 0.12),
  ] };
  beforeAll(() => {
    expect(require('node:fs').existsSync(require('node:path').join(__dirname, 'dependency-graph.builder.ts'))).toBe(true);
    buildGraph = require('./dependency-graph.builder').buildDependencyGraph;
  });
  it('returns exactly the requested example with stable IDs, quantities and server statuses', () => {
    expect(buildGraph([dish])).toEqual({ nodes: [
      { id: 'product:1', type: 'ingredient', data: { name: 'Помидоры', quantity: 0, unit: 'кг', status: 'out_of_stock' } },
      { id: 'product:2', type: 'ingredient', data: { name: 'Базилик', quantity: 0.05, unit: 'кг', status: 'low_stock' } },
      { id: 'product:3', type: 'ingredient', data: { name: 'Спагетти', quantity: 12, unit: 'кг', status: 'available' } },
      { id: 'dish:11', type: 'dish', data: { name: 'Паста Маринара', status: 'unavailable' } },
    ], edges: [
      { id: 'recipe:1', source: 'product:1', target: 'dish:11', data: { required: 0.15, unit: 'кг', status: 'unavailable' } },
      { id: 'recipe:2', source: 'product:2', target: 'dish:11', data: { required: 0.01, unit: 'кг', status: 'low_stock' } },
      { id: 'recipe:3', source: 'product:3', target: 'dish:11', data: { required: 0.12, unit: 'кг', status: 'available' } },
    ] });
  });
  it('uses one ingredient node and different statuses for different recipe requirements', () => {
    const result = buildGraph([
      { id: 11, name: 'Большая порция', recipeItems: [recipe(1, 1, 'Помидоры', 1, 2)] },
      { id: 12, name: 'Средняя порция', recipeItems: [{ ...recipe(2, 1, 'Помидоры', 1, 0.2), dishId: 12 }] },
      { id: 13, name: 'Малая порция', recipeItems: [{ ...recipe(3, 1, 'Помидоры', 1, 0.1), dishId: 13 }] },
    ]);
    expect(result.nodes.filter(node => node.type === 'ingredient')).toHaveLength(1);
    expect(result.edges.map(edge => edge.data.status)).toEqual(['unavailable', 'low_stock', 'available']);
    expect(result.nodes[0].data.status).toBe('low_stock');
    const ids = new Set(result.nodes.map(node => node.id));
    expect(result.edges.every(edge => ids.has(edge.source) && ids.has(edge.target))).toBe(true);
  });
  it.each([[0, 'unavailable'], [0.09, 'unavailable'], [0.1, 'low_stock'], [0.5, 'low_stock'], [0.6, 'available']])(
    'classifies stock %s at the agreed 0/1/5/6-portion boundaries', (stock, status) => {
      const result = buildGraph([{ ...dish, recipeItems: [recipe(1, 1, 'Помидоры', stock as number, 0.1)] }]);
      expect(result.edges[0].data.status).toBe(status);
      expect(result.nodes.find(node => node.type === 'dish').data.status).toBe(status);
    });
  it('returns empty arrays for an empty catalog and unavailable dishes without recipes', () => {
    expect(buildGraph([])).toEqual({ nodes: [], edges: [] });
    expect(buildGraph([{ ...dish, recipeItems: [] }])).toEqual({
      nodes: [{ id: 'dish:11', type: 'dish', data: { name: dish.name, status: 'unavailable' } }], edges: [],
    });
  });
  it('rejects duplicate IDs, malformed rows and inconsistent shared ingredient stocks', () => {
    for (const data of [null, {}, [dish, dish], [{ ...dish, recipeItems: [{ ...dish.recipeItems[0], quantity: 0 }] }],
      [{ ...dish, recipeItems: [dish.recipeItems[0], { ...dish.recipeItems[0], id: 2, stock: 99 }] }]]) {
      expect(() => buildGraph(data)).toThrow();
    }
  });
});
