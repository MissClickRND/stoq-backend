import { DemoRestaurantService } from './demo-restaurant.service';
import {
  restaurantId,
  restaurantStorage,
} from '../../common/tenant/restaurant-context';
import { ROUTING_KEYS } from '../../common/rabbitMQ/rabbitmq-topology';
describe('rich demo restaurant', () => {
  it('creates ten complete linked records per main entity, historical sales, expiry and shortages under its own tenant', async () => {
    let sequence = 0;
    const tenants: number[] = [];
    const bus = {
      sendCommand: jest.fn(async (_e, key, payload) => {
        tenants.push(restaurantId());
        let data: any = { id: ++sequence };
        if (key === ROUTING_KEYS.CREATE_UNIT)
          data = { id: sequence, ...payload.dto };
        if (key === ROUTING_KEYS.CREATE_MANY_PRODUCT)
          data = payload.map((p: any, i: number) => ({ ...p, id: 100 + i }));
        if (key === ROUTING_KEYS.CREATE_DISHES_MANY)
          data = payload.dtos.map((p: any, i: number) => ({
            ...p,
            id: 200 + i,
          }));
        if (key === ROUTING_KEYS.GET_INVENTORY)
          data = Array.from({ length: 10 }, (_, i) => ({
            id: 300 + i,
            productId: 100 + i,
            Quantity: 50,
            expiresAt: '2099-01-01T00:00:00Z',
          }));
        if (key === ROUTING_KEYS.UPDATE_QUANTITY_INVENTORY)
          data = {
            statistics: { checked: 2 },
            batches: [],
            completedAt: new Date().toISOString(),
          };
        return { success: true, data };
      }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new (DemoRestaurantService as any)(bus, audit);
    const accounts = [
      { id: 1, fullName: 'Demo admin', role: 'ADMIN' },
      { id: 2, fullName: 'Demo waiter', role: 'WAITER' },
    ];
    await restaurantStorage.run(5, async () => {
      expect(await service.seed(77, accounts)).toMatchObject({
        products: 10,
        dishes: 10,
        supplies: 10,
        orders: 10,
        units: 10,
      });
      expect(restaurantId()).toBe(5);
    });
    expect(tenants.every((id) => id === 77)).toBe(true);
    const calls = bus.sendCommand.mock.calls;
    expect(
      calls.filter((c) => c[1] === ROUTING_KEYS.CREATE_SUPPLY),
    ).toHaveLength(10);
    expect(
      calls.filter((c) => c[1] === ROUTING_KEYS.CREATE_ORDER),
    ).toHaveLength(10);
    expect(
      calls.filter(
        (c) =>
          c[1] === ROUTING_KEYS.CHANGE_ORDER_STATUS &&
          c[2].status === 'completed',
      ),
    ).toHaveLength(7);
    expect(calls.some((c) => c[1] === ROUTING_KEYS.EXPIRE_INVENTORY)).toBe(
      true,
    );
    expect(
      calls.filter(
        (c) => c[1] === ROUTING_KEYS.GET_DISH_STATISTICS && c[2].forceRefresh,
      ),
    ).toHaveLength(2);
    expect(
      calls
        .filter((c) => c[1] === ROUTING_KEYS.CREATE_ORDER)
        .every((c) => c[2].creator?.id),
    ).toBe(true);
    expect(audit.record.mock.calls.length).toBeGreaterThanOrEqual(30);
  });
});
