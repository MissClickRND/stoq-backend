jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ProductService } from './product.service';

describe('UPD catalog resolution', () => {
  const unit = { id: 1, name: 'Штука', shortName: 'шт' };
  const milk = { id: 10, name: 'Молоко 3,2%', unitId: 1, unit, isDeleted: false };
  const row = { name: 'Молоко 3,2%', unit: 'шт', quantity: 24, price: 95, totalPrice: 2508 };
  let tx: any;
  let service: any;
  beforeEach(() => {
    tx = { $queryRaw: jest.fn(), unit: { findMany: jest.fn().mockResolvedValue([unit]),
      upsert: jest.fn().mockImplementation(async ({ create }) => ({ id: 2, ...create })) },
      product: { findMany: jest.fn().mockResolvedValue([milk]),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 11, ...data, unit })) } };
    service = new ProductService({ $transaction: jest.fn(async (fn) => fn(tx)) } as any);
  });
  it('reuses normalized names and preserves the document total independently of unit price', async () => {
    const result = await service.resolveUpdProducts({ items: [{ ...row, name: '  молоко   3,2% ', unit: 'ШТ.' }] });
    expect(result).toEqual([{ productId: 10, name: milk.name, unit, quantity: 24, price: 95, totalPrice: 2508 }]);
    expect(tx.product.create).not.toHaveBeenCalled();
  });
  it('creates missing products once even when a document repeats the same name', async () => {
    const result = await service.resolveUpdProducts({ items: [{ ...row, name: 'Сливки' }, { ...row, name: ' сливки ' }] });
    expect(result.map((item) => item.productId)).toEqual([11, 11]);
    expect(tx.product.create).toHaveBeenCalledTimes(1);
  });
  it('keeps the existing product unit when catalog aliases represent the same measurement', async () => {
    const otherUnit = { id: 2, name: 'Штук', shortName: 'штук' };
    tx.product.findMany.mockResolvedValue([{ ...milk, unitId: 2, unit: otherUnit }]);
    tx.unit.findMany.mockResolvedValue([unit, otherUnit]);
    const result = await service.resolveUpdProducts({ items: [row] });
    expect(result[0].unit.id).toBe(2);
  });
  it('creates a readable missing unit and keeps unreadable amounts as null', async () => {
    const result = await service.resolveUpdProducts({ items: [{ ...row, name: 'Сыр', unit: 'кг', quantity: null, totalPrice: null }] });
    expect(tx.unit.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { name: 'Килограмм', shortName: 'кг', restaurantId: 1 } }));
    expect(result[0]).toMatchObject({ quantity: null, totalPrice: null });
  });
  it('ignores delivery before checking units or creating products', async () => {
    const result = await service.resolveUpdProducts({ items: [row, { ...row, name: 'Доставка', unit: null },
      { ...row, name: 'Услуги по доставке', unit: null }, { ...row, name: 'Услуга доставки', unit: null }] });
    expect(result).toHaveLength(1);
    expect(tx.product.create).not.toHaveBeenCalled();
  });
  it.each([null, ''])('rejects unreadable product names (%s) before creating anything', async name => {
    await expect(service.resolveUpdProducts({ items: [{ ...row, name }] })).rejects.toThrow('наименование');
    expect(tx.product.create).not.toHaveBeenCalled();
  });
  it('rejects unreadable units and mismatched existing units', async () => {
    await expect(service.resolveUpdProducts({ items: [{ ...row, unit: null }] })).rejects.toThrow('единиц');
    await expect(service.resolveUpdProducts({ items: [{ ...row, unit: 'кг' }] })).rejects.toThrow('единиц');
  });
  it('does not restore a deleted product implicitly', async () => {
    tx.product.findMany.mockResolvedValue([{ ...milk, isDeleted: true }]);
    await expect(service.resolveUpdProducts({ items: [row] })).rejects.toThrow('удал');
    expect(tx.product.create).not.toHaveBeenCalled();
  });
  it('reports delivery-only documents without creating catalog records', async () => {
    await expect(service.resolveUpdProducts({ items: [{ ...row, name: 'Доставка' }] })).rejects.toThrow('товар');
    expect(tx.product.create).not.toHaveBeenCalled();
  });
});
