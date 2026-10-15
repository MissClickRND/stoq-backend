import { ConfigService } from '@nestjs/config';
import { DemoRestaurantController } from './demo-restaurant.controller';
import { ROUTING_KEYS } from '../../common/rabbitMQ/rabbitmq-topology';

describe('demo restaurant endpoints', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = env; delete process.env.ENABLE_TEST_TOOLS; });
  const request = { headers: {}, cookies: { accessToken: 'actor' } } as any;

  it('marks a restaurant ready only after successful fixture creation', async () => {
    const auth = { request: jest.fn().mockResolvedValueOnce({ restaurant: { id: 77, name: 'Демо' }, accounts: [] }).mockResolvedValue({ ok: true }) };
    const demo = { seed: jest.fn().mockResolvedValue({ products: 6 }) };
    const controller = new DemoRestaurantController(auth as any, demo as any, new ConfigService());
    const result = await controller.create(request);
    expect(demo.seed).toHaveBeenCalledWith(77);
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
});
