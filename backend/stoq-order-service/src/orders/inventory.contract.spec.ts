jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../common/rabbitMQ/command-bus.service', () => ({
  CommandBusService: class {},
}));
jest.mock('./order-event.publisher', () => ({ OrderEventPublisher: class {} }));
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { EXCHANGES, ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';

describe('Order inventory product mapping', () => {
  const items = [
    { dishId: 101, quantity: 3 },
    { dishId: 202, quantity: 2 },
  ];
  const products = [
    { productId: 7, quantity: 0.5 },
    { productId: 8, quantity: 0.75 },
  ];
  let dishes: Record<number, any>;
  let prisma: any;
  let bus: any;
  let service: OrdersService;

  beforeEach(() => {
    dishes = {
      101: {
        id: 101,
        name: 'Салат',
        salePrice: 100,
        recipeItems: [
          { productId: 7, quantity: 0.1 },
          { productId: 8, quantity: 0.25 },
        ],
      },
      202: {
        id: 202,
        name: 'Суп',
        salePrice: 200,
        recipeItems: [{ productId: 7, quantity: 0.1 }],
      },
    };
    prisma = {
      order: {
        create: jest.fn(async ({ data }) => ({
          ...data,
          id: 9,
          items: data.items?.create ?? [],
        })),
        findUnique: jest.fn(async () => ({
          id: 9,
          status: OrderStatus.created,
          date: new Date(),
          items,
        })),
        update: jest.fn(async ({ data }) => ({
          id: 9,
          date: new Date(),
          ...data,
          items: items.map(item => ({ ...item, price: dishes[item.dishId].salePrice })),
        })),
      },
      orderItem: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }) => data),
      },
      $transaction: jest.fn(async (operations) => Promise.all(operations)),
    };
    bus = {
      sendCommand: jest.fn(async (_exchange, key, payload) => ({
        success: true,
        data:
          key === ROUTING_KEYS.GET_DISHES_BY_ID
            ? dishes[payload.id]
            : undefined,
      })),
    };
    service = new OrdersService(prisma, bus, {
      publishOrderCreated: jest.fn(),
    } as any);
  });

  it('checks recipe products, sums shared ingredients and preserves dish IDs in the order', async () => {
    const order = await service.create({ items });
    expect(bus.sendCommand).toHaveBeenCalledWith(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CHECK_STOCK_INVENTORY,
      { dto: products },
    );
    expect(bus.sendCommand).toHaveBeenCalledTimes(4);
    expect(order.items).toMatchObject(items);
    expect(order.totalPrice).toBe(700);
  });

  it('freezes items after processing starts', async () => {
    await expect(service.addItems({ orderId: 9, dto: { items } })).rejects.toThrow('зафиксирован');
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });

  it.each([OrderStatus.completed, OrderStatus.rejected])('does not deduct again for %s', async status => {
    await service.changeStatus({ id: 9, status });
    expect(bus.sendCommand).not.toHaveBeenCalled();
  });

  it('deducts at creation before publishing processing status', async () => {
    await service.create({ items });
    expect(prisma.order.create.mock.calls[0][0].data.status).toBe(OrderStatus.pending_reservation);
    expect(bus.sendCommand).toHaveBeenCalledWith(EXCHANGES.COMMANDS, ROUTING_KEYS.DEDUCT_STOCK_INVENTORY,
      { dto: { orderId: '9', idempotencyKey: 'order-9-deduction', items: products } });
    expect(prisma.order.update.mock.calls[0][0].data.status).toBe(OrderStatus.created);
  });

  it('keeps ambiguous deduction pending and never publishes processing', async () => {
    const original = bus.sendCommand.getMockImplementation();
    bus.sendCommand.mockImplementation(async (...args) => {
      if(args[1] === ROUTING_KEYS.DEDUCT_STOCK_INVENTORY) throw new Error('timeout');
      return original(...args);
    });
    await expect(service.create({ items })).rejects.toThrow('Сервис склада');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects the technical order when another order has already consumed stock', async () => {
    const original = bus.sendCommand.getMockImplementation();
    bus.sendCommand.mockImplementation(async (...args) => {
      if (args[1] === ROUTING_KEYS.DEDUCT_STOCK_INVENTORY) {
        return { success: false, error: { status: 409, message: 'Остаток уже занят' } };
      }
      return original(...args);
    });
    await expect(service.create({ items })).rejects.toThrow('Остаток уже занят');
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { restaurantId: expect.any(Number), id: 9 },
      data: { status: OrderStatus.rejected },
    });
    expect(prisma.order.update).toHaveBeenCalledTimes(1);
  });

  it('does not allow finishing or rejecting an ambiguous pending order', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 9, status: OrderStatus.pending_reservation });
    await expect(service.changeStatus({ id: 9, status: OrderStatus.rejected })).rejects.toThrow('не подтверждено');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('gives the first request the last portion even while its catalog call is slow', async () => {
    let release; const slow = new Promise(resolve => { release = resolve; });
    let stock = 1; let first = true;
    bus.sendCommand.mockImplementation(async (_exchange,key,payload) => {
      if(key === ROUTING_KEYS.GET_DISHES_BY_ID) {
        if(first){ first=false; await slow; }
        return { success: true, data: dishes[payload.id] };
      }
      if(stock === 0) return { success: false, error: { status: 400, message: 'Недостаточно продуктов' } };
      if(key === ROUTING_KEYS.DEDUCT_STOCK_INVENTORY) stock--;
      return { success: true };
    });
    const earliest=service.create({ items: [{ dishId: 101, quantity: 1 }] });
    const later=service.create({ items: [{ dishId: 202, quantity: 1 }] });
    release();
    const results=await Promise.allSettled([earliest,later]);
    expect(results.map(result=>result.status)).toEqual(['fulfilled','rejected']);
    expect(stock).toBe(0);
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    [],
    [{ productId: 7, quantity: 0 }],
    [{ productId: 7, quantity: -1 }],
    [{ productId: 7, quantity: NaN }],
    [{ productId: 0, quantity: 1 }],
    [null],
  ])(
    'rejects invalid recipes before checking inventory or saving: %j',
    async (recipeItems) => {
      dishes[101].recipeItems = recipeItems;
      await expect(service.create({ items })).rejects.toThrow(/рецептур/);
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(
        bus.sendCommand.mock.calls.every(
          ([, key]) => key === ROUTING_KEYS.GET_DISHES_BY_ID,
        ),
      ).toBe(true);
    },
  );

  it('does not save when inventory reports a shortage', async () => {
    bus.sendCommand.mockImplementation(async (_exchange, key, payload) =>
      key === ROUTING_KEYS.GET_DISHES_BY_ID
        ? { success: true, data: dishes[payload.id] }
        : {
            success: false,
            error: { status: 400, message: 'Недостаточно продуктов' },
          },
    );
    await expect(service.create({ items })).rejects.toThrow(
      'Недостаточно продуктов',
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('does not contact inventory or save when the catalog is unavailable', async () => {
    bus.sendCommand.mockRejectedValue(new Error('broker unavailable'));
    await expect(service.create({ items })).rejects.toThrow('Каталог');
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('creates an empty order without catalog or inventory requests', async () => {
    await service.create();
    expect(bus.sendCommand).not.toHaveBeenCalled();
  });
});
