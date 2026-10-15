import { InventoryService } from './inventory.service';
import { Prisma } from '@prisma/client';
describe('Expired batch disposal and stock movement journal', () => {
  const zero = new Prisma.Decimal(0);
  let tx: any; let service: any;
  beforeEach(() => {
    tx = { batch: { findUnique: jest.fn(async () => ({ id: 7, status: 'EXPIRED', disposedAt: null, balance: { availableQuantity: zero, reservedQuantity: zero } })), updateMany: jest.fn(async () => ({ count: 1 })) }, stockMovement: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new InventoryService({ ...tx, $transaction: async fn => fn(tx) } as any, { sendCommand: jest.fn().mockResolvedValue({ success: true, data: [] }) } as any);
  });
  it('marks a zero-balance expired batch disposed within its tenant, preserving all stock history', async () => {
    expect(await service.disposeBatch(7)).toMatchObject({ batchId: 7, alreadyDisposed: false });
    expect(tx.batch.updateMany.mock.calls[0][0].where).toMatchObject({ restaurantId: 1, id: 7, status: 'EXPIRED', disposedAt: null });
  });
  it('rejects active or reserved batches, and is idempotent', async () => {
    tx.batch.findUnique.mockResolvedValue({ id: 7, status: 'ACTIVE', balance: { availableQuantity: zero, reservedQuantity: zero } });
    await expect(service.disposeBatch(7)).rejects.toThrow();
    tx.batch.findUnique.mockResolvedValue({ id: 7, status: 'EXPIRED', disposedAt: new Date(), balance: { availableQuantity: zero, reservedQuantity: zero } });
    expect(await service.disposeBatch(7)).toMatchObject({ alreadyDisposed: true });
    expect(tx.batch.updateMany).not.toHaveBeenCalled();
  });
  it('returns committed negative movements by increasing id with server product names and authors', async () => {
    tx.stockMovement.findMany.mockResolvedValue([{ id: 12, productId: 2, batchId: 7, orderId: '20', type: 'DEDUCTION', quantity: new Prisma.Decimal(-.5), createdAt: new Date(), actorId: 3, actorName: 'Иван', actorRole: 'WAITER' }]);
    const result = await service.getMovementHistory(10);
    expect(result.items[0]).toMatchObject({ id: 12, quantity: -.5, actor: { id: 3, name: 'Иван', role: 'WAITER' } });
    expect(tx.stockMovement.findMany.mock.calls[0][0].where).toMatchObject({ restaurantId: 1, id: { gt: 10 }, quantity: { lt: 0 } });
  });
});
