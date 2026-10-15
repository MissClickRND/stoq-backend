import { BatchStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { InventoryService } from './inventory.service';

describe('Atomic order stock deduction', () => {
  it('lets only one competing order consume the last portion', async () => {
    let quantity = new Decimal(1);
    let ready = 0;
    let release!: () => void;
    const bothReading = new Promise<void>(resolve => { release = resolve; });
    const movements: any[] = [];
    const tx: any = {
      idempotencyKey: { create: jest.fn(async () => ({})) },
      batch: {
        findMany: jest.fn(async () => {
          const snapshot = quantity;
          // Both availability checks and FEFO reads see the last portion.
          if (++ready === 4) release();
          if (ready > 2) await bothReading;
          return [{ id: 1, productId: 7, status: BatchStatus.ACTIVE,
            balance: { availableQuantity: snapshot } }];
        }),
        update: jest.fn(async () => ({})),
      },
      batchBalance: { updateMany: jest.fn(async ({ where, data }) => {
        if (!quantity.equals(where.availableQuantity)) return { count: 0 };
        quantity = quantity.minus(data.availableQuantity.decrement);
        return { count: 1 };
      }) },
      stockMovement: { createMany: jest.fn(async ({ data }) => { movements.push(...data); }) },
    };
    const prisma: any = {
      idempotencyKey: { findUnique: jest.fn(async () => null) },
      $transaction: jest.fn(async callback => callback(tx)),
    };
    const bus: any = { publishEvent: jest.fn(async () => undefined) };
    const service = new InventoryService(prisma, bus);
    const results = await Promise.allSettled([1, 2].map(id => service.deductStock({
      orderId: String(id), idempotencyKey: `order-${id}-deduction`,
      items: [{ productId: 7, quantity: 1 }],
    })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(quantity.toNumber()).toBe(0);
    expect(movements).toHaveLength(1);
    expect(bus.publishEvent).toHaveBeenCalledTimes(1);
  });

  it('returns an idempotent result without touching stock on retry', async () => {
    const prisma: any = {
      idempotencyKey: { findUnique: jest.fn(async () => ({ orderId: '9' })) },
      $transaction: jest.fn(),
    };
    const service = new InventoryService(prisma, {} as any);
    await expect(service.deductStock({ orderId: '9', idempotencyKey: 'order-9-deduction',
      items: [{ productId: 7, quantity: 1 }] })).resolves.toMatchObject({ success: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
