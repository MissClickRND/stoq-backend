jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
jest.mock('./order-event.publisher', () => ({ OrderEventPublisher: class {} }));
import { OrdersService } from './orders.service';

describe('business data reset', () => {
  it('removes order positions before orders, only after explicit confirmation', async () => {
    const steps: string[] = [];
    const tx: any = {
      orderItem: { deleteMany: jest.fn(async () => { steps.push('items'); return { count: 2 }; }) },
      order: { deleteMany: jest.fn(async () => { steps.push('orders'); return { count: 1 }; }) },
    };
    const prisma: any = { $transaction: jest.fn(async fn => fn(tx)) };
    const service = new OrdersService(prisma, {} as any, {} as any);
    await expect(service.resetBusinessData('')).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await expect(service.resetBusinessData('RESET')).resolves.toEqual({ orders: 1 });
    expect(steps).toEqual(['items', 'orders']);
  });
});
