jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { SupplyService } from './supplies.service';
import { mapSupplyWithItemsToDto } from './dto/response/supply-response.dto';
describe('Supply pricing contract', () => {
  const product = { id: 1, name: 'Молоко', unit: { id: 1, name: 'Литр', shortName: 'л' } };
  it('persists supplier, line totals and derived batch price; returns complete POST result', async () => {
    const created = { id: 1, supplyNumber: 'S1', supplier: 'ООО Молоко', totalPrice: 300, receivedAt: new Date(), status: 'RECEIVED' };
    const tx: any = { supply: { create: jest.fn().mockResolvedValue(created) },
      batch: { create: jest.fn().mockResolvedValue({ id: 2 }) },
      supplyItem: { create: jest.fn().mockImplementation(({ data }) => ({ id: 3, ...data })) },
      batchBalance: { create: jest.fn() } };
    const prisma: any = { $transaction: (fn: any) => fn(tx) };
    const bus: any = { sendCommand: jest.fn().mockResolvedValue({ success: true, data: [product] }) };
    const response: any = await new SupplyService(prisma, bus).createSupply({ supplyNumber: 'S1', supplier: ' ООО Молоко ',
      items: [{ productId: 1, quantity: 3, totalPrice: 300, expiresAt: new Date('2030-01-01') }] } as any);
    expect(tx.supply.create.mock.calls[0][0].data.supplier).toBe('ООО Молоко');
    expect(Number(tx.supply.create.mock.calls[0][0].data.totalPrice)).toBe(300);
    expect(Number(tx.batch.create.mock.calls[0][0].data.price)).toBe(100);
    expect(response).toMatchObject({ supplier: 'ООО Молоко', totalPrice: 300, items: [{ totalPrice: 300, price: 100, quantity: 3, product }] });
  });
  it('GET serializes Decimal totals; legacy unknown totals stay null', () => {
    const result: any = mapSupplyWithItemsToDto({ id: 1, supplyNumber: 'S1', supplier: 'ABC', totalPrice: { toNumber: () => 12.5 },
      receivedAt: new Date(), status: 'RECEIVED', items: [{ id: 3, productId: 1, quantity: 2, totalPrice: { toNumber: () => 12.5 }, expiresAt: new Date() }] } as any, new Map([[1, product]]));
    expect(result.totalPrice).toBe(12.5);
    expect(result.items[0]).toMatchObject({ totalPrice: 12.5, price: 6.25 });
    const legacy: any = mapSupplyWithItemsToDto({ id: 2, supplyNumber: 'OLD', receivedAt: new Date(), status: 'RECEIVED' }, new Map());
    expect(legacy.totalPrice).toBeNull();
  });
  it('rejects zero quantity and negative totals before a transaction', async () => {
    const prisma: any = { $transaction: jest.fn() };
    const service = new SupplyService(prisma, {} as any);
    for (const item of [{ quantity: 0, totalPrice: 10 }, { quantity: 1, totalPrice: -1 }])
      await expect(service.createSupply({ supplier: 'A', supplyNumber: 'S', items: [{ ...item, productId: 1, expiresAt: new Date() }] } as any)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
