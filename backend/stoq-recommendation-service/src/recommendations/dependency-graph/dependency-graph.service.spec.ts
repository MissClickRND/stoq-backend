// Isolate ESM configuration loading in Jest on Node 22; real Nest bootstrap is covered by integration.
jest.mock('@nestjs/config', () => ({ ConfigService: class {
  constructor(private values: Record<string, unknown> = {}) {}
  get(key: string, fallback: unknown) { return this.values[key] ?? fallback; }
} }));
import { ConfigService } from '@nestjs/config';

describe('Recommendation dependency graph', () => {
  const graph = { nodes: [{ id: 'dish:11', type: 'dish', data: { name: 'Паста', status: 'unavailable' } }], edges: [] };
  let DependencyGraphService: any;
  beforeAll(() => {
    expect(require('node:fs').existsSync(require('node:path').join(__dirname, 'dependency-graph.service.ts'))).toBe(true);
    DependencyGraphService = require('./dependency-graph.service').DependencyGraphService;
  });
  it('fetches catalog data through the existing bus and builds the graph in recommendation', async () => {
    const bus = { sendCommand: jest.fn().mockResolvedValue({ success: true, data: [{ id: 11, name: 'Паста', recipeItems: [] }] }) };
    const service = new DependencyGraphService(bus, new ConfigService());
    expect(await service.getGraph()).toEqual(graph);
    expect(bus.sendCommand).toHaveBeenCalledWith('app.commands', 'command.catalog.get_dishes', {});
  });
  it('reads the agreed graph threshold from recommendation configuration', async () => {
    const data = [{ id: 11, name: 'Паста', recipeItems: [{ id: 1, dishId: 11, productId: 1, quantity: 1, stock: 4,
      product: { id: 1, name: 'Мука', unit: { shortName: 'кг' } } }] }];
    const service = new DependencyGraphService({ sendCommand: jest.fn().mockResolvedValue({ success: true, data }) },
      new ConfigService({ DEPENDENCY_GRAPH_LOW_STOCK_PORTIONS: 3 }));
    expect((await service.getGraph()).edges[0].data.status).toBe('available');
  });
  it('wraps the graph in the standard RPC envelope and preserves the existing stop-list handler', async () => {
    const { RecommendationsRPCController } = require('../recommendations-rpc.controller');
    const recommendation = { getStopListDishes: jest.fn().mockResolvedValue([{ id: 1 }]) };
    const graphService = { getGraph: jest.fn().mockResolvedValue(graph) };
    const consumer = new RecommendationsRPCController(recommendation, graphService);
    expect(await consumer.getGraph()).toEqual({ success: true, data: graph });
    expect(await consumer.findAll({ search: 'Паста' })).toEqual({ success: true, data: [{ id: 1 }] });
    expect(recommendation.getStopListDishes).toHaveBeenCalledWith('Паста');
  });
});
