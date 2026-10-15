import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthRPCController } from './auth-rpc.controller';

describe('Admin server statistics', () => {
  let service: any;
  let prisma: any;
  let users: any[];
  let invitations: any[];
  beforeEach(() => {
    users = [
      { id: 1, restaurantId: 7, role: 'ADMIN', blocked: false },
      { id: 2, restaurantId: 7, role: 'ADMIN', blocked: true },
      { id: 3, restaurantId: 7, role: 'WAIT_CONFIRM', blocked: false },
      { id: 4, restaurantId: 99, role: 'ADMIN', blocked: false },
    ];
    const base = { restaurantId: 7, usedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 3600000) };
    invitations = [base, { ...base, restaurantId: 99 }, { ...base, usedAt: new Date() }, { ...base, revokedAt: new Date() }, { ...base, expiresAt: new Date(0) }];
    prisma = {
      user: { findUnique: jest.fn(async () => users[0]), count: jest.fn(async ({ where }) => users.filter(u => u.restaurantId === where.restaurantId && (!where.role || u.role === where.role) && (where.blocked === undefined || u.blocked === where.blocked)).length) },
      invitation: { count: jest.fn(async ({ where }) => invitations.filter(i => i.restaurantId === where.restaurantId && i.usedAt === where.usedAt && i.revokedAt === where.revokedAt && i.expiresAt > where.expiresAt.gt).length) },
    };
    service = new AuthService(new JwtService(), new ConfigService({ NODE_ENV: 'test' }), prisma);
  });
  it('counts only the acting restaurant and only active invitations/unblocked admins', async () => {
    expect(await service.getAdminStatistics(1)).toEqual({ employees: 3, invitations: 1, requests: 1, admins: 1 });
    expect(prisma.invitation.count).toHaveBeenCalledWith({ where: { restaurantId: 7, usedAt: null, revokedAt: null, expiresAt: { gt: expect.any(Date) } } });
  });
  it.each([{ role: 'MANAGER', blocked: false }, { role: 'ADMIN', blocked: true }])('denies non-administrators and blocked actors', async (actor) => {
    prisma.user.findUnique.mockResolvedValue({ ...users[0], ...actor });
    await expect(service.getAdminStatistics(1)).rejects.toMatchObject({ status: 403 });
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.invitation.count).not.toHaveBeenCalled();
  });
  it('uses the existing RPC success/error envelope and verified actor id', async () => {
    service.verifyAccessToken = jest.fn(async () => ({ id: 1, restaurantId: 99 }));
    const rpc: any = new AuthRPCController(service);
    expect(await rpc.adminStatistics({ accessToken: 'token' })).toEqual({ success: true, data: { employees: 3, invitations: 1, requests: 1, admins: 1 } });
    prisma.user.findUnique.mockResolvedValue({ ...users[0], role: 'MANAGER' });
    expect(await rpc.adminStatistics({ accessToken: 'token' })).toMatchObject({ success: false, error: { status: 403 } });
  });
});
