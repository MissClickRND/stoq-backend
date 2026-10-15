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
          items,
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
    expect(bus.sendCommand).toHaveBeenCalledTimes(3);
    expect(order.items).toMatchObject(items);
    expect(order.totalPrice).toBe(700);
  });

  it('uses recipe products when adding dishes', async () => {
    await service.addItems({ orderId: 9, dto: { items } });
    expect(bus.sendCommand).toHaveBeenCalledWith(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CHECK_STOCK_INVENTORY,
      { dto: products },
    );
    expect(prisma.orderItem.create).toHaveBeenCalledTimes(2);
  });

  it.each([OrderStatus.confirmed, OrderStatus.completed])(
    'deducts recipe products for status %s',
    async (status) => {
      await service.changeStatus({ id: 9, status });
      expect(bus.sendCommand).toHaveBeenCalledWith(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.DEDUCT_STOCK_INVENTORY,
        {
          dto: {
            orderId: '9',
            idempotencyKey: 'order-9-deduction',
            items: products,
          },
        },
      );
    },
  );

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
