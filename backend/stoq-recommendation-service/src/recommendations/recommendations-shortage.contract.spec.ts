jest.mock('../common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { RecommendationService } from './recommendations.service';

describe('recommendation shortage ingredient snapshots', () => {
  it('uses the same whole portions at floating-point boundaries for status and incident attribution', async () => {
    let quantities = [.7, .1];
    const snapshots: any[] = [];
    const catalog = [{ id: 1, name: 'Dish', salePrice: 100, recipeItems: [
      { productId: 7, quantity: .2, product: { name: 'Flour', unit: { id: 1, name: 'kg', shortName: 'kg' } } },
      { productId: 8, quantity: 1, product: { name: 'Unconstrained' } },
    ] }];
    const bus: any = { sendCommand: jest.fn(async (_exchange, key) => ({ success: true, data:
      key === 'command.catalog.get_dishes' ? catalog : [
        ...quantities.map(availableQuantity => ({ productId: 7, availableQuantity, expiresAt: '2035-01-01' })),
        { productId: 8, availableQuantity: 20, expiresAt: '2035-01-01' },
      ] })) };
    const tracker: any = { reconcile: jest.fn(async load => { const snapshot = await load(); snapshots.push(snapshot); return snapshot.result; }) };
    const service = new RecommendationService(bus, { set: jest.fn() } as any, tracker);
    expect((await service.getDishStatuses(true))[0]).toMatchObject({ status: 'AVAILABLE', maxPortions: 4 });
    expect(snapshots[0].dishes[0].products).toEqual([]);
    quantities = [.4];
    expect((await service.getDishStatuses(true))[0]).toMatchObject({ status: 'LOW_STOCK', maxPortions: 2 });
    expect(snapshots[1].dishes[0].products).toEqual([{ productId: 7, name: 'Flour', unit: { id: 1, name: 'kg', shortName: 'kg' } }]);
    quantities = [0];
    await service.getDishStatuses(true);
    expect(snapshots[2].dishes[0]).toMatchObject({ status: 'STOP_LIST', products: [{ productId: 7 }] });
  });

  it('uses a readable product identity for missing legacy enrichment', async () => {
    const bus: any = { sendCommand: jest.fn(async (_exchange, key) => ({ success: true, data:
      key === 'command.catalog.get_dishes' ? [{ id: 1, name: 'Dish', salePrice: 100,
        recipeItems: [{ productId: 7, quantity: 1 }] }] : [] })) };
    let snapshot: any;
    const tracker: any = { reconcile: jest.fn(async load => { snapshot = await load(); return snapshot.result; }) };
    await new RecommendationService(bus, { set: jest.fn() } as any, tracker).getDishStatuses(true);
    expect(snapshot.dishes[0].products).toEqual([{ productId: 7, name: 'Продукт №7', unit: null }]);
  });
});
