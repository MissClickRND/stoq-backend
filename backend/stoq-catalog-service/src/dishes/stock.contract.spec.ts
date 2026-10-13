jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('src/common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
import { DishesService } from './dishes.service';
describe('Dish stock contract', () => {
  it('does not save a new dish when warehouse pricing is unavailable', async () => {
    const prisma: any = { product: { count: jest.fn().mockResolvedValue(1) }, dish: { create: jest.fn().mockResolvedValue({ id: 1, recipeItems: [] }) } };
    const bus: any = { sendCommand: jest.fn().mockRejectedValue(new Error('warehouse unavailable')) };
    await expect(new DishesService(prisma, bus).create({ name: 'Салат', recipeItems: [{ productId: 1, quantity: 0.5 }] })).rejects.toThrow();
    expect(prisma.dish.create).not.toHaveBeenCalled();
  });
  it('POST stores category and fractional recipes atomically and returns the enriched dish', async () => {
    const created = { id: 1, name: 'Салат', category: 'Салаты', salePrice: 300,
      recipeItems: [{ productId: 1, quantity: 0.25, product: { id: 1 } }] };
    const prisma: any = { product: { count: jest.fn().mockResolvedValue(1) },
      dish: { create: jest.fn().mockResolvedValue(created), findFirst: jest.fn().mockResolvedValue(created) } };
    const bus: any = { sendCommand: jest.fn().mockResolvedValue({ success: true, data: [] }) };
    const result: any = await new DishesService(prisma, bus).create({ name: 'Салат', category: 'Салаты', salePrice: 300,
      recipeItems: [{ productId: 1, quantity: 0.25 }] });
    expect(prisma.dish.create.mock.calls[0][0].data.recipeItems.create).toEqual([{ productId: 1, quantity: 0.25 }]);
    expect(result).toMatchObject({ category: 'Салаты', availablePortions: 0, recipeItems: [{ quantity: 0.25, stock: 0 }] });
    expect(bus.sendCommand.mock.calls[0][1]).toBe('command.inventory.get_stock');
  });
  const dish = { id: 1, name: 'Салат', category: 'Салаты', recipeItems: [
    { productId: 1, quantity: 2, product: { id: 1, name: 'Помидор' } },
    { productId: 2, quantity: 0.5, product: { id: 2, name: 'Огурец' } }] };
  it('GET list includes warehouse prices, stock and limiting portions using one RPC', async () => {
    const rows = [{ productId: 1, availableQuantity: 10, price: 100, expiresAt: '2030-01-01' },
      { productId: 1, availableQuantity: 5, price: 120, expiresAt: '2030-02-01' },
      { productId: 2, availableQuantity: 2, price: 80, expiresAt: '2030-01-01' }];
    const bus: any = { sendCommand: jest.fn().mockResolvedValue({ success: true, data: rows }) };
    const prisma: any = { dish: { findMany: jest.fn().mockResolvedValue([dish]) } };
    const [result]: any = await new DishesService(prisma, bus).findAll();
    expect(result.category).toBe('Салаты');
    expect(result.recipeItems[0]).toMatchObject({ stock: 15, price: 106.666667, portions: 7 });
    expect(result.recipeItems[1]).toMatchObject({ stock: 2, price: 80, portions: 4 });
    expect(result.availablePortions).toBe(4);
    expect(bus.sendCommand).toHaveBeenCalledTimes(1);
  });
  it('GET detail does not manufacture stock or unknown price', async () => {
    const bus: any = { sendCommand: jest.fn().mockResolvedValue({ success: true, data: [] }) };
    const prisma: any = { dish: { findFirst: jest.fn().mockResolvedValue(dish) } };
    const result: any = await new DishesService(prisma, bus).findOne(1);
    expect(result.availablePortions).toBe(0);
    expect(result.recipeItems[0]).toMatchObject({ stock: 0, price: null, portions: 0 });
  });
});
