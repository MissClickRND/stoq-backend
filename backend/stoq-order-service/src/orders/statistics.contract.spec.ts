jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
import { OrdersService } from './orders.service';
import { Prisma } from '@prisma/client';

describe('Order statistics source', () => {
  const now = new Date('2026-10-15T21:30:00Z'); // 16 October in Moscow
  let prisma: any;
  let service: any;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = { order: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new OrdersService(prisma, {} as any, {} as any);
  });
  afterEach(() => jest.useRealTimers());
  it('uses tenant and business date with Moscow boundaries, excludes future orders', async () => {
    const result = await service.getPeriodStatistics(7);
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ restaurantId: 1,
      date: { gte: new Date('2026-10-09T21:00:00Z'), lte: now } });
    expect(result.points).toHaveLength(7);
    expect(result.points[6]).toMatchObject({ date: '2026-10-16', orders: 0, revenue: 0 });
    expect(result.summary).toEqual({ orders: 0, completed: 0, revenue: 0 });
  });
  it('counts visible orders, captured completed sales and quantities, never cancelled revenue', async () => {
    prisma.order.findMany.mockResolvedValue([
      { date: now, status: 'completed', items: [{ dishId: 2, quantity: 3, price: new Prisma.Decimal('99.99') }] },
      { date: now, status: 'created', items: [] },
      { date: now, status: 'rejected', items: [{ dishId: 2, quantity: 9, price: new Prisma.Decimal(100) }] },
    ]);
    const result = await service.getPeriodStatistics(7);
    expect(result.summary).toEqual({ orders: 2, completed: 1, revenue: 299.97 });
    expect(result.points[6].dishes).toEqual([{ dishId: 2, quantity: 3, revenue: 299.97 }]);
    expect(await service.getTodayStatistics()).toMatchObject({ total: 3, completed: 1, cancelled: 1, active: 1, revenue: '299.97' });
  });
  it('preserves unknown historical prices in totals and daily dish revenue', async () => {
    prisma.order.findMany.mockResolvedValue([{ date: now, status: 'completed',
      items: [{ dishId: 2, quantity: 2, price: null }] }]);
    const result = await service.getPeriodStatistics(7);
    expect(result.summary.revenue).toBeNull();
    expect(result.points[6]).toMatchObject({ revenue: null, dishes: [{ dishId: 2, quantity: 2, revenue: null }] });
    expect((await service.getTodayStatistics()).revenue).toBeNull();
  });
  it.each([0, -1, 31, 1.5, NaN])('rejects invalid period %s', async days => {
    await expect(service.getPeriodStatistics(days)).rejects.toThrow();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
