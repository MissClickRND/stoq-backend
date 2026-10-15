jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
jest.mock('./order-event.publisher', () => ({ OrderEventPublisher: class {} }));
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';
import { executeRpc } from '../common/utils/rpc-handler';

describe('Order stock error contract', () => {
  it.each(['create', 'addItems', 'changeStatus'])('preserves missing products through RPC for %s', async (operation) => {
    const items = [{ dishId: 1, quantity: 1 }];
    const error = { status: 400, message: 'Недостаточно товаров', products: [{ productId: 7, name: 'Молоко' }] };
    const prisma: any = {
      order: {
        findUnique: jest.fn(async () => ({ id: 9, status: OrderStatus.created })),
        update: jest.fn(async () => ({ id: 9, items })),
        create: jest.fn(),
      },
      orderItem: { findMany: jest.fn(async () => []), create: jest.fn() },
    };
    const bus: any = { sendCommand: jest.fn(async (_exchange, key) =>
      key === ROUTING_KEYS.GET_DISHES_BY_ID
        ? { success: true, data: { id: 1, name: 'Каша', salePrice: 100, recipeItems: [{ productId: 7, quantity: 1 }] } }
        : { success: false, error },
    ) };
    const service = new OrdersService(prisma, bus, {} as any);
    const result = await executeRpc(() => {
      if (operation === 'create') return service.create({ items });
      if (operation === 'addItems') return service.addItems({ orderId: 9, dto: { items } });
      return service.changeStatus({ id: 9, status: OrderStatus.confirmed });
    });
    expect(result).toEqual({ success: false, error });
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });
});
