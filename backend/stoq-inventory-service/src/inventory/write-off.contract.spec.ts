import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';

function setup(quantity: number, reserved = 0) {
  const tx: any = {
    batch: { findUnique: jest.fn(async () => ({ id: 9, productId: 7, status: 'ACTIVE',
      balance: { availableQuantity: new Prisma.Decimal(quantity), reservedQuantity: new Prisma.Decimal(reserved) } })), update: jest.fn() },
    batchBalance: { updateMany: jest.fn(async () => ({ count: 1 })) },
    stockMovement: { create: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn(async (fn) => fn(tx)) };
  const bus: any = { publishEvent: jest.fn() };
  return { service: new InventoryService(prisma, bus), tx, bus };
}

describe('warehouse write-off', () => {
  it('sets available stock to zero and records the removed amount', async () => {
    const { service, tx, bus } = setup(2.5);
    const result = await service.writeOffBatch(9);
    expect(result.availableQuantity).toBe(0);
    expect(tx.batchBalance.updateMany.mock.calls[0][0].where.batchId).toBe(9);
    expect(Number(tx.stockMovement.create.mock.calls[0][0].data.quantity)).toBe(-2.5);
    expect(result).toEqual({ batchId: 9, availableQuantity: 0, writtenOffQuantity: 2.5 });
    expect(bus.publishEvent).toHaveBeenCalledWith('app.events', 'inventory.stock.changed', expect.objectContaining({
      reason: 'MANUAL_WRITE_OFF', productIds: [7], batchIds: [9],
    }));
  });
  it('is idempotent for depleted batches', async () => {
    const { service, tx } = setup(0);
    await service.writeOffBatch(9);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
  it('does not erase reserved stock or overwrite concurrent deductions', async () => {
    const reserved = setup(2, 1);
    await expect(reserved.service.writeOffBatch(9)).rejects.toBeInstanceOf(ConflictException);
    const concurrent = setup(2);
    concurrent.tx.batchBalance.updateMany.mockResolvedValue({ count: 0 });
    await expect(concurrent.service.writeOffBatch(9)).rejects.toBeInstanceOf(ConflictException);
  });
});
