jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { AuditRPCController } from './audit-rpc.controller';

describe('Activity RPC permissions', () => {
  it('uses the verified restaurant and refuses waiter/invalid sessions', async () => {
    const list = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const verifyAccessToken = jest.fn().mockResolvedValue({ id: 1, restaurantId: 7, role: 'MANAGER' });
    const rpc = new AuditRPCController({ list } as any, { verifyAccessToken } as any);
    expect(await rpc.list({ accessToken: 'token', cursor: 'cursor' })).toMatchObject({ success: true });
    expect(list).toHaveBeenLastCalledWith(7, 'cursor');
    verifyAccessToken.mockResolvedValue({ id: 2, restaurantId: 99, role: 'WAITER' });
    expect(await rpc.list({ accessToken: 'token' })).toMatchObject({ success: false, error: { status: 403 } });
    expect(list).toHaveBeenCalledTimes(1);
  });
});
