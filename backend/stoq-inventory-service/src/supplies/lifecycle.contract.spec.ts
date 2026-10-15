import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SupplyService } from './supplies.service';

const item = { productId: 7, quantity: 3, totalPrice: 300, expiresAt: new Date('2035-01-01') };
const dto = { supplyNumber: 'S1', supplier: 'Supplier', receivedAt: new Date('2030-01-01'), items: [item] };

function setup(status = 'IN_TRANSIT', consumed = false) {
  let supply: any = { id: 1, ...dto, status, totalPrice: 300, items: [{ id: 10, ...item }] };
  const batches = status === 'RECEIVED' ? [{ id: 20, ...item, initialQuantity: new Prisma.Decimal(3), price: new Prisma.Decimal(100),
    balance: { availableQuantity: new Prisma.Decimal(consumed ? 2 : 3), reservedQuantity: new Prisma.Decimal(0) } }] : [];
  const tx: any = {
    supply: {
      create: jest.fn(async ({ data }) => ({ id: 1, ...data })),
      findUnique: jest.fn(async () => supply),
      update: jest.fn(async ({ data }) => (supply = { ...supply, ...data })),
    },
    supplyItem: { create: jest.fn(async ({ data }) => ({ id: 10, ...data })), deleteMany: jest.fn() },
    batch: { create: jest.fn(async ({ data }) => ({ id: 20, ...data })), findMany: jest.fn(async () => batches), update: jest.fn(), deleteMany: jest.fn() },
    batchBalance: { create: jest.fn(), deleteMany: jest.fn(), update: jest.fn() },
    stockMovement: { count: jest.fn(async () => consumed ? 1 : 0) },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (fn) => fn(tx)) };
  const bus: any = { sendCommand: jest.fn(async () => ({ success: true, data: [{ id: 7, name: 'Flour' }] })), publishEvent: jest.fn() };
  return { service: new SupplyService(prisma, bus), tx, bus };
}

describe('additive supply lifecycle', () => {
  it('keeps old creation behavior when status is omitted', async () => {
    const { service, tx } = setup();
    await service.createSupply(dto);
    expect(tx.supply.create.mock.calls[0][0].data.status).toBe('RECEIVED');
    expect(tx.batch.create).toHaveBeenCalledTimes(1);
    expect(tx.batchBalance.create.mock.calls[0][0].data.availableQuantity).toBe(3);
  });
  it.each(['IN_TRANSIT', 'CANCELLED'])('does not put %s supplies into warehouse stock', async (status) => {
    const { service, tx } = setup();
    await service.createSupply({ ...dto, status } as any);
    expect(tx.supply.create.mock.calls[0][0].data.status).toBe(status);
    expect(tx.supplyItem.create).toHaveBeenCalledTimes(1);
    expect(tx.batch.create).not.toHaveBeenCalled();
  });
  it('accepts an expected supply once; a repeated save does not duplicate batches', async () => {
    const { service, tx } = setup();
    await service.updateSupply(1, { ...dto, status: 'RECEIVED' } as any);
    await service.updateSupply(1, { ...dto, status: 'RECEIVED' } as any);
    expect(tx.batch.create).toHaveBeenCalledTimes(1);
    expect(tx.supply.update).toHaveBeenCalledTimes(2);
  });
  it('preserves stock history when metadata is edited after consumption', async () => {
    const { service, tx } = setup('RECEIVED', true);
    await service.updateSupply(1, { ...dto, supplier: 'Updated', status: 'RECEIVED' } as any);
    expect(tx.batch.deleteMany).not.toHaveBeenCalled();
    expect(tx.batchBalance.update).not.toHaveBeenCalled();
  });
  it('preserves batch IDs when an unused received line is corrected', async () => {
    const { service, tx } = setup('RECEIVED', false);
    await service.updateSupply(1, { ...dto, status: 'RECEIVED', items: [{ ...item, quantity: 4 }] } as any);
    expect(tx.batch.create).not.toHaveBeenCalled();
    expect(tx.batch.deleteMany).not.toHaveBeenCalled();
    expect(tx.batch.update.mock.calls[0][0]).toMatchObject({ where: { id: 20 }, data: { initialQuantity: 4 } });
  });
  it('rejects changing consumed supply contents or reversing its receipt', async () => {
    const { service } = setup('RECEIVED', true);
    await expect(service.updateSupply(1, { ...dto, status: 'RECEIVED', items: [{ ...item, quantity: 4 }] } as any)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateSupply(1, { ...dto, status: 'IN_TRANSIT' } as any)).rejects.toBeInstanceOf(ConflictException);
  });
  it('removes inventory children before supplies when a test reset is confirmed', async () => {
    const steps: string[] = [];
    const remove = (name: string) => ({ deleteMany: jest.fn(async () => { steps.push(name); return { count: 1 }; }) });
    const tx: any = { stockMovement: remove('movements'), idempotencyKey: remove('keys'), batchBalance: remove('balances'),
      batch: remove('batches'), supplyItem: remove('items'), supply: remove('supplies') };
    const service = new SupplyService({ $transaction: async fn => fn(tx) } as any, { publishEvent: jest.fn() } as any);
    await expect(service.resetBusinessData('')).rejects.toThrow();
    expect(steps).toEqual([]);
    await service.resetBusinessData('RESET');
    expect(steps).toEqual(['movements', 'keys', 'balances', 'batches', 'items', 'supplies']);
  });
});
