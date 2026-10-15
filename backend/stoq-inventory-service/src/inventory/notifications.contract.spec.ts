import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { Logger } from '@nestjs/common';

function setup() {
  let committed = false;
  const batch = { id: 9, productId: 7, expiresAt: new Date('2020-01-01'),
    balance: { availableQuantity: new Prisma.Decimal(10) } };
  const tx: any = {
    batch: { updateMany: jest.fn(async () => ({ count: 1 })) },
    batchBalance: {
      findUniqueOrThrow: jest.fn(async () => ({ availableQuantity: new Prisma.Decimal('2.5') })),
      update: jest.fn(),
    },
    stockMovement: { create: jest.fn() },
  };
  const prisma: any = {
    batch: { findMany: jest.fn(async () => [batch]) },
    $transaction: jest.fn(async (fn) => {
      const result = await fn(tx);
      committed = true;
      return result;
    }),
  };
  const bus: any = { publishEvent: jest.fn(async () => { expect(committed).toBe(true); }) };
  return { service: new InventoryService(prisma, bus), tx, prisma, bus };
}

describe('inventory notifications', () => {
  beforeEach(() => { jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}); });
  afterEach(() => { jest.restoreAllMocks(); });
  it('includes products removed by a manual update while preserving the update response', async () => {
    const { service, prisma, tx, bus } = setup();
    prisma.batchBalance = { findMany: jest.fn(async () => [{ batchId: 9 }]) };
    tx.batch.findMany = jest.fn(async () => [{ id: 9, productId: 7, status: 'ACTIVE',
      balance: { availableQuantity: new Prisma.Decimal(10) } }]);
    tx.batch.update = jest.fn(async () => ({ id: 9, status: 'DEPLETED' }));
    tx.batchBalance.update.mockResolvedValue({ batchId: 9, availableQuantity: 0 });
    const response = await service.updateQuantity({ items: [{ batchId: 9, quantity: 0 }] });
    expect(response).toEqual([{ batchId: 9, availableQuantity: 0 }, { id: 9, status: 'DEPLETED' }]);
    expect(bus.publishEvent).toHaveBeenCalledWith('app.events', 'inventory.stock.changed', expect.objectContaining({
      reason: 'MANUAL_UPDATE', productIds: [7], batchIds: [9],
    }));
  });
  it('publishes expiration and stock changes only after commit, using the current balance', async () => {
    const { service, tx, bus } = setup();
    await service.processJustExpiredBatches();
    expect(bus.publishEvent).toHaveBeenCalledWith('app.events', 'inventory.batch_expired', expect.objectContaining({
      eventId: expect.any(String), occurredAt: expect.any(String), batchId: 9, productId: 7,
      lostQuantity: '2.5', expiredAt: '2020-01-01T00:00:00.000Z',
    }));
    expect(bus.publishEvent).toHaveBeenCalledWith('app.events', 'inventory.stock.changed', expect.objectContaining({
      eventId: expect.any(String), occurredAt: expect.any(String), reason: 'EXPIRATION_WRITE_OFF', batchIds: [9], productIds: [7],
    }));
    expect(Number(tx.stockMovement.create.mock.calls[0][0].data.quantity)).toBe(-2.5);
  });

  it('does not publish for a batch already claimed by another worker', async () => {
    const { service, tx, bus } = setup();
    tx.batch.updateMany.mockResolvedValue({ count: 0 });
    await service.processJustExpiredBatches();
    expect(bus.publishEvent).not.toHaveBeenCalled();
    expect(tx.batchBalance.update).not.toHaveBeenCalled();
  });

  it('does not publish if the transaction rolls back at commit', async () => {
    const { service, prisma, bus } = setup();
    const transaction = prisma.$transaction.getMockImplementation();
    prisma.$transaction.mockImplementation(async (fn) => {
      await transaction(fn);
      throw new Error('commit failed');
    });
    await service.processJustExpiredBatches();
    expect(bus.publishEvent).not.toHaveBeenCalled();
  });

  it('still attempts a stock refresh when the expiration publication fails', async () => {
    const { service, bus } = setup();
    bus.publishEvent.mockRejectedValueOnce(new Error('broker unavailable'));
    await service.processJustExpiredBatches();
    expect(bus.publishEvent).toHaveBeenCalledTimes(2);
    expect(bus.publishEvent.mock.calls[1][1]).toBe('inventory.stock.changed');
  });

  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER])('rejects invalid expiration threshold %s', async (days) => {
    const { service, prisma } = setup();
    await expect(service.getExpiringSoonBatches(days)).rejects.toThrow();
    expect(prisma.batch.findMany).not.toHaveBeenCalled();
  });
});
