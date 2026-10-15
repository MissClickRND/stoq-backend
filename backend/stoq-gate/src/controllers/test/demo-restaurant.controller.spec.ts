import { ConfigService } from '@nestjs/config';
import { DemoRestaurantController } from './demo-restaurant.controller';
import { ROUTING_KEYS } from '../../common/rabbitMQ/rabbitmq-topology';

describe('demo restaurant endpoints', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = env; delete process.env.ENABLE_TEST_TOOLS; delete process.env.ENABLE_DEMO_RESTAURANTS; });
  const request = { headers: {}, cookies: { accessToken: 'actor' } } as any;

  it('marks a restaurant ready only after successful fixture creation', async () => {
    const auth = { request: jest.fn().mockResolvedValueOnce({ restaurant: { id: 77, name: 'Демо' }, accounts: [] }).mockResolvedValue({ ok: true }) };
    const demo = { seed: jest.fn().mockResolvedValue({ products: 6 }) };
    const controller = new DemoRestaurantController(auth as any, demo as any, new ConfigService());
    const result = await controller.create(request);
    expect(demo.seed).toHaveBeenCalledWith(77, []);
    expect(auth.request).toHaveBeenLastCalledWith(ROUTING_KEYS.AUTH_COMPLETE_DEMO_RESTAURANT, { accessToken: 'actor', restaurantId: 77 });
    expect(result.data.products).toBe(6);
  });

  it('does not publish an incomplete restaurant as ready', async () => {
    const auth = { request: jest.fn().mockResolvedValue({ restaurant: { id: 77 }, accounts: [] }) };
    const demo = { seed: jest.fn().mockRejectedValue(new Error('Inventory unavailable')) };
    const controller = new DemoRestaurantController(auth as any, demo as any, new ConfigService());
    await expect(controller.create(request)).rejects.toMatchObject({ response: { restaurantId: 77 } });
    expect(auth.request).toHaveBeenCalledTimes(1);
  });

  it('disables public demo entry points in production by default', () => {
    process.env.NODE_ENV = 'production';
    const auth = { request: jest.fn() };
    const controller = new DemoRestaurantController(auth as any, {} as any, new ConfigService());
    expect(() => controller.list()).toThrow('Тестовый ресторан отключён');
    expect(auth.request).not.toHaveBeenCalled();
  });

  it.each(['ENABLE_DEMO_RESTAURANTS', 'ENABLE_TEST_TOOLS'])('enables production demo creation, listing and login with %s', async (flag) => {
    process.env.NODE_ENV = 'production';
    process.env[flag] = 'true';
    const user = { id: 4, restaurantId: 77, role: 'MANAGER' };
    const session = { user, accessToken: 'access', refreshToken: 'refresh', accessMaxAgeMs: 1000, refreshMaxAgeMs: 2000 };
    const auth = { request: jest.fn(async (key) => {
      if (key === ROUTING_KEYS.AUTH_CREATE_DEMO_RESTAURANT) return { restaurant: { id: 77 }, accounts: [] };
      if (key === ROUTING_KEYS.AUTH_DEMO_LOGIN) return session;
      return [];
    }) };
    const demo = { seed: jest.fn(async () => ({ products: 6 })) };
    const response = { cookie: jest.fn() };
    const controller = new DemoRestaurantController(auth as any, demo as any, new ConfigService());
    expect(await controller.create(request)).toMatchObject({ restaurant: { id: 77 }, data: { products: 6 } });
    await controller.list();
    expect(await controller.login(77, { role: 'MANAGER' }, response as any)).toEqual({ user });
    expect(auth.request).toHaveBeenCalledWith(ROUTING_KEYS.AUTH_LIST_DEMO_RESTAURANTS, {});
    expect(response.cookie).toHaveBeenCalledTimes(2);
  });
});
