jest.mock('../common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
jest.mock('../recommendations/recommendations.service', () => ({ RecommendationService: class {} }));
import { StatisticsService } from './statistics.service';

describe('Server dashboard and dish statistics', () => {
  let service: any;
  let bus: any;
  let source: any;
  let dishes: any[];
  beforeEach(() => {
    source = { days: 7, timezone: 'Europe/Moscow', from: '2026-10-09T21:00:00Z', to: '2026-10-16T10:00:00Z',
      summary: { revenue: 300, orders: 3, completed: 2 },
      points: [{ date: '2026-10-16', label: '16 окт.', orders: 3, completed: 2, revenue: 300,
        dishes: [{ dishId: 2, quantity: 3, revenue: 300 }] }] };
    dishes = [{ id: 2, costPrice: 20, availablePortions: 8 }];
    bus = { sendCommand: jest.fn(async (_e, key) => ({ success: true, data: key === 'command.catalog.get_dishes' ? dishes : source })) };
    service = new StatisticsService({ getDishStatuses: jest.fn().mockResolvedValue([{ dishId: 2, status: 'AVAILABLE', maxPortions: 8 }]) } as any, bus, {} as any);
  });
  it('returns server totals, estimated costs and average completed check', async () => {
    const result = await service.getDashboardStatistics(7);
    expect(result.summary).toEqual({ revenue: 300, earning: 240, averageCheck: 150, orders: 3, completed: 2 });
    expect(result.points[0]).toEqual({ date: '2026-10-16', label: '16 окт.', revenue: 300, earning: 240, orders: 3 });
  });
  it('keeps unknown costs and prices unknown rather than substituting zero', async () => {
    dishes[0].costPrice = null;
    expect((await service.getDashboardStatistics(7)).summary.earning).toBeNull();
    source.summary.revenue = null; source.points[0].revenue = null;
    expect((await service.getDashboardStatistics(7)).summary.averageCheck).toBeNull();
  });
  it('returns actual dish quantities, historical captured revenue and null popularity without sales', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-16T10:00:00Z'));
    expect(await service.getDishDetailsStatistics(2, 7)).toMatchObject({ dishId: 2, today: 3, week: 3, popularity: 1,
      revenue: 300, ingredientCost: 60, earning: 240, availablePortions: 8, status: 'AVAILABLE' });
    source.points[0].dishes = [];
    expect(await service.getDishDetailsStatistics(2, 7)).toMatchObject({ today: 0, week: 0, popularity: null, revenue: 0 });
    jest.useRealTimers();
  });
  it('rejects foreign or deleted dish and upstream failures, without fabricated empty success', async () => {
    await expect(service.getDishDetailsStatistics(99, 7)).rejects.toThrow();
    bus.sendCommand.mockResolvedValue({ success: false, error: { status: 503, message: 'Unavailable' } });
    await expect(service.getDashboardStatistics(7)).rejects.toThrow();
  });
});
