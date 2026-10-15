import { InventoryService } from './inventory.service';
import { executeRpc } from '../common/utils/rpc-handler';

describe('Stock shortage error contract', () => {
  it.each([false, true])('returns every missing product, even without batches (catalog unavailable: %s)', async (unavailable) => {
    const prisma: any = { batch: { findMany: jest.fn(async () => []) } };
    const bus: any = {
      sendCommand: jest.fn(async (_exchange, _key, { id }) => {
        if (unavailable) throw new Error('catalog unavailable');
        return { success: true, data: { id, name: id === 7 ? 'Молоко' : 'Мука' } };
      }),
    };
    const service = new InventoryService(prisma, bus);
    const result = await executeRpc(() => service.checkStockAvailability([
      { productId: 7, quantity: 2 },
      { productId: 8, quantity: 1 },
    ]));
    expect(result).toEqual({
      success: false,
      error: {
        status: 400,
        message: expect.stringContaining('Недостаточно товаров'),
        products: [
          { productId: 7, name: unavailable ? 'Товар ID 7' : 'Молоко' },
          { productId: 8, name: unavailable ? 'Товар ID 8' : 'Мука' },
        ],
      },
    });
  });

  it('does not query the catalog when stock is sufficient', async () => {
    const prisma: any = { batch: { findMany: jest.fn(async () => []) } };
    const bus: any = { sendCommand: jest.fn() };
    await new InventoryService(prisma, bus).checkStockAvailability([]);
    expect(bus.sendCommand).not.toHaveBeenCalled();
  });
});
