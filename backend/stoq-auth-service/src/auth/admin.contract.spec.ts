import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('Restaurant administration security', () => {
  let auth: any;
  let prisma: any;
  const admin = { id: 1, restaurantId: 7, role: 'ADMIN', blocked: false };
  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(async () => admin), findFirst: jest.fn(), findMany: jest.fn(async () => []), update: jest.fn(), create: jest.fn(), count: jest.fn(async () => 2) },
      invitation: { findMany: jest.fn(async () => []), findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      restaurant: { findMany: jest.fn(async () => []), findUnique: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (callback) => callback(prisma));
    auth = new AuthService(new JwtService(), new ConfigService({ NODE_ENV: 'test' }), prisma);
  });

  it('lists only restaurant employees and exposes safe status fields', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 2, role: 'WAIT_CONFIRM', blocked: false }, { id: 3, role: 'WAITER', blocked: true }]);
    expect(await auth.getAdminUsers(1)).toMatchObject([{ status: 'pending' }, { status: 'blocked' }]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId: 7 }, select: expect.not.objectContaining({ passwordHash: true, hashedRefreshToken: true }) }));
  });

  it('cannot mutate an employee in another restaurant or block the acting admin', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(auth.setUserRole(1, 99, { role: 'MANAGER' })).rejects.toMatchObject({ status: 404 });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 99, restaurantId: 7 } }));
    prisma.user.findFirst.mockResolvedValue(admin);
    await expect(auth.setUserBlock(1, 1, { blocked: true })).rejects.toMatchObject({ status: 400 });
    await expect(auth.setUserRole(1, 1, { role: 'WAITER' })).rejects.toMatchObject({ status: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('role and block changes revoke existing access and refresh sessions', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 2, restaurantId: 7, role: 'WAITER', blocked: false });
    prisma.user.update.mockResolvedValue({ id: 2, role: 'MANAGER', blocked: false });
    await auth.setUserRole(1, 2, { role: 'MANAGER' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'MANAGER', tokenVersion: { increment: 1 }, hashedRefreshToken: null }) }));
    await auth.setUserBlock(1, 2, { blocked: true });
    expect(prisma.user.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ blocked: true, tokenVersion: { increment: 1 }, hashedRefreshToken: null }) }));
  });

  it('rejects blocked access payloads even if the token version matches', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...admin, blocked: true, tokenVersion: 0 });
    await expect(auth.validateAccessPayload({ sub: 1, tokenVersion: 0 })).rejects.toMatchObject({ status: 401 });
  });

  it('scopes invitations and rejects expired, revoked, used or other-restaurant invitations', async () => {
    await auth.getInvitations(1);
    expect(prisma.invitation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId: 7 } }));
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.restaurant.findUnique.mockResolvedValue({ id: 7 });
    prisma.invitation.updateMany.mockResolvedValue({ count: 0 });
    await expect(auth.registerUser({ fullName: 'Test User', email: 'test@example.com', password: 'password', restaurantId: 7, invitationId: 'invite-id' })).rejects.toMatchObject({ status: 400 });
    expect(prisma.invitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'invite-id', restaurantId: 7, usedAt: null, revokedAt: null, expiresAt: { gt: expect.any(Date) } }) }));
  });

  it('demo login only selects explicitly flagged demo restaurants and production disables tools', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ id: 7, isDemo: false });
    await expect(auth.demoLogin(7, 'ADMIN')).rejects.toMatchObject({ status: 404 });
    const production: any = new AuthService(new JwtService(), new ConfigService({ NODE_ENV: 'production' }), prisma);
    await expect(production.listDemoRestaurants()).rejects.toMatchObject({ status: 404 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('assigns the stored invitation role and consumes it in the account creation transaction', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.restaurant.findUnique.mockResolvedValue({ id: 7 });
    prisma.invitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.invitation.findUniqueOrThrow.mockResolvedValue({ role: 'STOREKEEPER' });
    prisma.user.create.mockResolvedValue({ id: 2, role: 'STOREKEEPER', restaurantId: 7 });
    const result = await auth.registerUser({ fullName: 'Invited User', email: 'invite@example.com', password: 'password', restaurantId: 7, invitationId: 'invite-id' });
    expect(result.user.role).toBe('STOREKEEPER');
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'STOREKEEPER', restaurantId: 7 }) }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps registrations without an invitation pending', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.restaurant.findUnique.mockResolvedValue({ id: 7 });
    prisma.user.create.mockResolvedValue({ id: 2, role: 'WAIT_CONFIRM', restaurantId: 7 });
    await auth.registerUser({ fullName: 'Pending User', email: 'pending@example.com', password: 'password', restaurantId: 7 });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'WAIT_CONFIRM' }) }));
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
  });

  it('hides incomplete demo seeds from listing and demo login', async () => {
    await auth.listDemoRestaurants();
    expect(prisma.restaurant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDemo: true, demoReady: true } }));
    prisma.restaurant.findUnique.mockResolvedValue({ id: 7, isDemo: true, demoReady: false });
    await expect(auth.demoLogin(7, 'ADMIN')).rejects.toMatchObject({ status: 404 });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
