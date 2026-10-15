import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { restaurantStorage } from '../common/tenant/restaurant-context';

const decimal = (n: number) => new Prisma.Decimal(n);
const now = new Date('2026-10-15T10:00:00Z');
const product = (id: number) => ({ id, name: `Product ${id}`, unit: { id: 1, name: 'kg', shortName: 'kg' } });
const batch = (id: number, productId: number, quantity: number, status = 'ACTIVE', expiresAt = '2026-12-01T00:00:00Z') => ({
  id, productId, supplyId: 1, status, expiresAt: new Date(expiresAt),
  balance: { availableQuantity: decimal(quantity), reservedQuantity: decimal(0) },
});

function setup(batches: any[] = []) {
  const tx: any = {
    batch: { findMany: jest.fn(async () => batches), update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })) },
    batchBalance: {
      findMany: jest.fn(async () => batches.map(b => ({ batchId: b.id, ...b.balance }))),
      update: jest.fn(async ({ where, data }) => ({ batchId: where.batchId, ...data })),
    },
    stockMovement: { findMany: jest.fn(async () => []) },
    supply: { findMany: jest.fn(async () => []) },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async fn => fn(tx)) };
  const bus: any = { sendCommand: jest.fn(async () => ({ success: true, data: [product(1), product(2), product(3), product(4)] })), publishEvent: jest.fn() };
  return { service: new InventoryService(prisma, bus) as any, tx, prisma, bus };
}

describe('server inventory statistics', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
  afterEach(() => jest.useRealTimers());

  it('counts catalog products and sums usable batches before identifying low stock', async () => {
    const { service, tx } = setup([
      batch(1, 1, 2), batch(2, 1, 20), batch(3, 2, 4, 'RUNNINGOUT', '2026-10-17T00:00:00Z'),
      batch(4, 3, 0, 'EXPIRED', '2026-10-01T00:00:00Z'), batch(5, 3, 0, 'EXPIRED', '2026-10-02T00:00:00Z'),
      batch(6, 4, 80, 'ACTIVE', '2026-10-14T00:00:00Z'),
    ]);
    const result = await restaurantStorage.run(17, () => service.getStatistics());
    expect(result).toMatchObject({ totalProducts: 4, depletedProducts: 2, expiringProducts: 1, spoiledProducts: 2 });
    expect(result.lowStockProducts.map(({ product, quantity }) => [product.id, quantity])).toEqual([[2, 4], [3, 0], [4, 0]]);
    expect(tx.batch.findMany.mock.calls[0][0].where.restaurantId).toBe(17);
  });

  it('propagates a failed catalog query rather than returning fabricated empty statistics', async () => {
    const { service, bus } = setup();
    bus.sendCommand.mockResolvedValue({ success: false, error: { status: 503, message: 'unavailable' } });
    await expect(service.getStatistics()).rejects.toThrow();
  });

  it('preserves automatic expiration history in spoiled product counts', async () => {
    const { service, tx } = setup([]);
    tx.stockMovement.findMany.mockResolvedValue([{ productId: 3 }, { productId: 3 }, { productId: 4 }]);
    expect(await restaurantStorage.run(21, () => service.getStatistics())).toMatchObject({ spoiledProducts: 2 });
    expect(tx.stockMovement.findMany.mock.calls[0][0].where).toMatchObject({ restaurantId: 21 });
  });

  it('returns expired zero balances once per batch with real movement quantities and legacy nulls', async () => {
    const { service, tx } = setup([
      batch(1, 1, 0, 'EXPIRED', '2026-10-01T00:00:00Z'),
      batch(2, 9, 0, 'EXPIRED', '2026-10-02T00:00:00Z'),
      batch(3, 2, 0, 'DEPLETED', '2026-10-02T00:00:00Z'),
      batch(4, 2, 10),
      { ...batch(5, 2, 0, 'EXPIRED', '2026-10-02T00:00:00Z'), supplyId: 99 },
    ]);
    tx.stockMovement.findMany.mockResolvedValue([
      { id: 1, batchId: 1, quantity: decimal(-2), type: 'WRITE_OFF', orderId: 'SYSTEM_EXPIRATION', createdAt: now },
      { id: 2, batchId: 1, quantity: decimal(-3), type: 'WRITE_OFF', orderId: 'SYSTEM_EXPIRATION', createdAt: now },
    ]);
    tx.supply.findMany.mockResolvedValue([{ id: 99 }]);
    const result = await restaurantStorage.run(19, () => service.getWriteOffs());
    expect(result).toHaveLength(2);
    expect(result.find(row => row.batchId === 1)).toMatchObject({ writtenOffQuantity: 5, writtenOffAt: now.toISOString(), reason: 'EXPIRED' });
    expect(result.find(row => row.batchId === 2)).toMatchObject({ writtenOffQuantity: null, writtenOffAt: null, product: { id: 9, name: 'Продукт №9', unit: null } });
    expect(tx.batch.findMany.mock.calls[0][0].where.restaurantId).toBe(19);
    expect(tx.stockMovement.findMany.mock.calls[0][0].where.restaurantId).toBe(19);
    expect(tx.supply.findMany.mock.calls[0][0].where.restaurantId).toBe(19);
  });

  it('separates automatic expiration losses from earlier manual write-offs of the same batch', async () => {
    const { service, tx } = setup([batch(1, 1, 0, 'EXPIRED', '2026-10-01T00:00:00Z')]);
    tx.stockMovement.findMany.mockResolvedValue([
      { id: 1, batchId: 1, quantity: decimal(-5), type: 'WRITE_OFF', orderId: 'manual-write-off', createdAt: new Date('2026-09-01') },
      { id: 2, batchId: 1, quantity: decimal(-2), type: 'WRITE_OFF', orderId: 'SYSTEM_EXPIRATION', createdAt: now },
    ]);
    expect(await service.getWriteOffs()).toMatchObject([{ batchId: 1, writtenOffQuantity: 2, writtenOffAt: now.toISOString() }]);
  });

  it('returns server product quantity on existing active batch detail DTOs', async () => {
    const { service } = setup([batch(1, 1, .7), batch(2, 1, .1)]);
    expect(await service.findOne(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, productQuantity: .8 }), expect.objectContaining({ id: 2, productQuantity: .8 }),
    ]));
  });

  it('hides expired active rows from the main list even before the expiry scheduler runs', async () => {
    const { service, tx } = setup([]);
    await service.findAll();
    expect(tx.batch.findMany.mock.calls[0][0].where.expiresAt).toEqual({ gt: now });
  });

  it('hides expired rows from a product lookup before the scheduler runs', async () => {
    const { service, tx } = setup([]);
    await expect(service.findOne(1)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.batch.findMany.mock.calls[0][0].where.expiresAt).toEqual({ gt: now });
  });
});

describe('inventory preview and transaction report', () => {
  it('compares persisted balances and distinguishes explicit removals from zero balances', async () => {
    const { service, tx } = setup([batch(1, 1, 10), batch(2, 2, 3), batch(3, 3, 8), batch(4, 4, 0, 'DEPLETED')]);
    const result = await restaurantStorage.run(23, () => service.preview({ items: [
      { batchId: 1, quantity: 10 }, { batchId: 2, quantity: 2 }, { batchId: 3, quantity: 123, remove: true }, { batchId: 4, quantity: 0 },
    ] }));
    expect(result).toEqual({ checked: 4, updated: 1, deleted: 1, unchanged: 2 });
    expect(tx.batch.findMany.mock.calls[0][0].where.restaurantId).toBe(23);
    expect(tx.batchBalance.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ batchId: 1, quantity: -1 }], [{ batchId: 1, quantity: Infinity }], [{ batchId: 1, quantity: NaN }],
    [{ batchId: 1, quantity: 1 }, { batchId: 1, quantity: 2 }], [{ batchId: 0, quantity: 1 }],
  ])('rejects malformed preview items %j', async (...items) => {
    const { service } = setup([batch(1, 1, 10)]);
    await expect(service.preview({ items })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing or foreign batches and expired stock cannot be restored', async () => {
    const missing = setup([]);
    await expect(missing.service.preview({ items: [{ batchId: 2, quantity: 1 }] })).rejects.toBeInstanceOf(NotFoundException);
    const expired = setup([batch(1, 1, 0, 'EXPIRED', '2020-01-01T00:00:00Z')]);
    await expect(expired.service.updateQuantity({ items: [{ batchId: 1, quantity: 3 }] })).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([{}, { items: [] }, { items: [null] }, { items: [{ batchId: 1, quantity: 1, remove: 'true' }] }])('rejects invalid RPC request objects %j', async dto => {
    await expect(setup().service.preview(dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calculates optional reports inside the transaction while preserving legacy arrays', async () => {
    const { service, tx, prisma } = setup([batch(1, 1, 5), batch(2, 2, 3)]);
    prisma.batchBalance.findMany.mockResolvedValue([{ batchId: 1, availableQuantity: decimal(100) }, { batchId: 2, availableQuantity: decimal(100) }]);
    const result = await service.updateQuantity({ includeReport: true, items: [{ batchId: 1, quantity: 5 }, { batchId: 2, quantity: 0, remove: true }] });
    expect(result.statistics).toEqual({ checked: 2, updated: 0, deleted: 1, unchanged: 1 });
    expect(Number(tx.batchBalance.update.mock.calls[1][0].data.availableQuantity)).toBe(0);
    expect(result.completedAt).toEqual(expect.any(String));
    expect(Array.isArray(result.batches)).toBe(true);
    const legacy = setup([batch(1, 1, 5)]);
    expect(Array.isArray(await legacy.service.updateQuantity({ items: [{ batchId: 1, quantity: 4 }] }))).toBe(true);
  });
});
