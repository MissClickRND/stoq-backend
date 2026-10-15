import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('Production demo restaurant feature flag', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(async () => ({ id: 1, restaurantId: 7, role: 'ADMIN', blocked: false })),
        create: jest.fn(async ({ data }) => ({ id: 4, ...data, passwordHash: undefined })),
        findFirst: jest.fn(async () => ({ id: 4, restaurantId: 77, role: 'MANAGER', email: 'demo@example.invalid', fullName: 'Demo', tokenVersion: 0 })),
        update: jest.fn(),
      },
      invitation: { createMany: jest.fn().mockResolvedValue({ count: 10 }) },
      activityLog: { createMany: jest.fn().mockResolvedValue({ count: 20 }) },
      restaurant: {
        create: jest.fn(async () => ({ id: 77, isDemo: true, demoReady: false })),
        findMany: jest.fn(async () => [{ id: 77, isDemo: true, demoReady: true, users: [] }]),
        findUnique: jest.fn(async () => ({ id: 77, isDemo: true, demoReady: true })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    prisma.$transaction = jest.fn(async fn => fn(prisma));
  });
  function service(flags = {}) {
    return new AuthService(new JwtService(), new ConfigService({ NODE_ENV: 'production', ENABLE_DEMO_RESTAURANTS: 'false', ENABLE_TEST_TOOLS: 'false', JWT_ACCESS_SECRET: 'test-access', JWT_REFRESH_SECRET: 'test-refresh', ...flags }), prisma);
  }
  it('keeps every demo operation disabled in production by default', async () => {
    const auth = service();
    await expect(auth.createDemoRestaurant(1)).rejects.toMatchObject({ status: 404 });
    await expect(auth.completeDemoRestaurant(1, 77)).rejects.toMatchObject({ status: 404 });
    await expect(auth.listDemoRestaurants()).rejects.toMatchObject({ status: 404 });
    await expect(auth.demoLogin(77, 'MANAGER')).rejects.toMatchObject({ status: 404 });
    expect(prisma.restaurant.create).not.toHaveBeenCalled();
    expect(prisma.restaurant.findMany).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('allows the full demo lifecycle with only the dedicated demo flag', async () => {
    const auth = service({ ENABLE_DEMO_RESTAURANTS: 'true' });
    expect(await auth.createDemoRestaurant(1)).toMatchObject({ restaurant: { id: 77, isDemo: true } });
    expect(prisma.user.create).toHaveBeenCalledTimes(10);
    expect(prisma.invitation.createMany.mock.calls[0][0].data).toHaveLength(10);
    expect(prisma.activityLog.createMany.mock.calls[0][0].data).toHaveLength(20);
    expect(await auth.completeDemoRestaurant(1, 77)).toEqual({ ok: true });
    expect(await auth.listDemoRestaurants()).toEqual([{ id: 77, isDemo: true, demoReady: true, accounts: [] }]);
    expect(await auth.demoLogin(77, 'MANAGER')).toMatchObject({ user: { id: 4, restaurantId: 77, role: 'MANAGER' }, accessToken: expect.any(String), refreshToken: expect.any(String) });
  });
  it('retains the legacy test tools flag', async () => {
    expect(await service({ ENABLE_TEST_TOOLS: 'true' }).listDemoRestaurants()).toHaveLength(1);
  });
  it('still requires an administrator to create a demo and excludes ordinary restaurants from demo login', async () => {
    const auth = service({ ENABLE_DEMO_RESTAURANTS: 'true' });
    prisma.user.findUnique.mockResolvedValue({ id: 1, restaurantId: 7, role: 'MANAGER', blocked: false });
    await expect(auth.createDemoRestaurant(1)).rejects.toMatchObject({ status: 403 });
    expect(prisma.restaurant.create).not.toHaveBeenCalled();
    prisma.restaurant.findUnique.mockResolvedValue({ id: 7, isDemo: false, demoReady: true });
    await expect(auth.demoLogin(7, 'MANAGER')).rejects.toMatchObject({ status: 404 });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
