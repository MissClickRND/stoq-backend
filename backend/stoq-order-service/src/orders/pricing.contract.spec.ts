jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
import { OrdersService } from './orders.service';

describe('Server order pricing', () => {
  let stored: any;
  let prisma: any;
  let bus: any;
  let service: OrdersService;
  beforeEach(() => {
    stored = undefined;
    prisma = { order: {
      create: jest.fn(async ({ data }) => (stored = { ...data, id: 1, status: 'created',
        items: (data.items?.create ?? []).map((item, index) => ({ id: index + 1, orderId: 1, ...item })) })),
      findUnique: jest.fn(async () => stored), findMany: jest.fn(async () => [stored]),
      update: jest.fn(async ({ data }) => (stored = { ...stored, ...data })),
    }, orderItem: { findMany: jest.fn(async () => stored.items), create: jest.fn(async ({ data }) => {
      const item = { id: stored.items.length + 1, ...data }; stored.items.push(item); return item;
    }) }, $transaction: jest.fn(async operations => Promise.all(operations)) };
    bus = { sendCommand: jest.fn(async (_exchange, _key, { id }) => ({ success: true,
      data: { id, name: 'Салат', salePrice: 99.99, imageURL: '/salad.png', recipeItems: [{ productId: 1, quantity: 1 }] } })) };
    service = new (OrdersService as any)(prisma, bus, { publishOrderCreated: jest.fn() });
  });
  it('takes catalog prices through the existing command and returns exact line and order totals', async () => {
    const result: any = await service.create({ items: [{ dishId: 2, quantity: 3 }, { dishId: 3, quantity: 2 }] });
    expect(result.totalPrice).toBe(499.95);
    expect(result.items[0]).toMatchObject({ name: 'Салат', price: 99.99, totalPrice: 299.97, imageURL: '/salad.png' });
    expect(bus.sendCommand).toHaveBeenCalledWith('app.commands', 'command.catalog.get_dishes_by_id', { id: 2 });
    bus.sendCommand.mockResolvedValue({ success: true, data: { id: 2, name: 'Новая цена', salePrice: 500 } });
    expect((await service.findOne(1) as any).totalPrice).toBe(499.95);
    expect((await service.findAll())[0].items[0].name).toBe('Салат');
    expect(bus.sendCommand).toHaveBeenCalledTimes(3);
  });
  it.each([null, undefined, -1, NaN, Infinity])('does not save a new order with an unknown/invalid catalog price (%s)', async salePrice => {
    bus.sendCommand.mockResolvedValue({ success: true, data: { id: 2, name: 'Салат', salePrice } });
    await expect(service.create({ items: [{ dishId: 2, quantity: 1 }] })).rejects.toThrow();
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
  it('accepts a real zero price', async () => {
    bus.sendCommand.mockResolvedValue({ success: true, data: { id: 2, name: 'Вода', salePrice: 0, recipeItems: [{ productId: 1, quantity: 1 }] } });
    expect((await service.create({ items: [{ dishId: 2, quantity: 1 }] }) as any).totalPrice).toBe(0);
  });
  it('preserves safe catalog errors and never writes after a broker failure', async () => {
    bus.sendCommand.mockResolvedValue({ success: false, error: { status: 404, message: 'Блюдо не найдено' } });
    await expect(service.create({ items: [{ dishId: 2, quantity: 1 }] })).rejects.toThrow('Блюдо не найдено');
    bus.sendCommand.mockRejectedValue(new Error('amqp://private-password@host'));
    await expect(service.create({ items: [{ dishId: 2, quantity: 1 }] })).rejects.toThrow('Каталог');
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
  it('keeps legacy prices unknown and gives empty orders a zero total', async () => {
    stored = { id: 1, date: new Date(), items: [{ dishId: 2, quantity: 1 }] };
    expect(await service.findOne(1)).toMatchObject({ totalPrice: null, items: [{ price: null, totalPrice: null }] });
    stored.items = [];
    expect(await service.findOne(1)).toMatchObject({ totalPrice: 0 });
    expect(bus.sendCommand).not.toHaveBeenCalled();
  });
  it('adds positions with new snapshots without replacing existing prices', async () => {
    await service.create({ items: [{ dishId: 2, quantity: 1 }] });
    bus.sendCommand.mockResolvedValue({ success: true, data: { id: 3, name: 'Суп', salePrice: 12.5, recipeItems: [{ productId: 1, quantity: 1 }] } });
    const result: any = await service.addItems({ orderId: 1, dto: { items: [{ dishId: 3, quantity: 2 }] } });
    expect(result.totalPrice).toBe(124.99);
    expect(result.items.map(item => item.price)).toEqual([99.99, 12.5]);
    expect(result.items.map(item => item.totalPrice)).toEqual([99.99, 25]);
  });
});
