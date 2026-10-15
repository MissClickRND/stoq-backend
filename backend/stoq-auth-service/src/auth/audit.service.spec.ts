jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { AuditService } from './audit.service';

describe('Restaurant activity history', () => {
  let prisma: any;
  let audit: any;
  beforeEach(() => {
    prisma = { activityLog: { upsert: jest.fn(async ({ create }) => create), findMany: jest.fn().mockResolvedValue([]) } };
    audit = new AuditService(prisma);
  });
  const event = { id: '272b82ea-1472-4668-ad44-43a1c96bfa20', action: 'create', category: 'Поставки', title: 'Создана поставка', description: 'Поставка №1', object: 'Поставка №1' };
  it('snapshots trusted author and tenant, rejects invalid actor and only saves display fields', async () => {
    await audit.append(7, { id: 2, fullName: 'Иван Петров', role: 'MANAGER' }, { ...event, password: 'never', accessToken: 'never' });
    const data = prisma.activityLog.upsert.mock.calls[0][0];
    expect(data.create).toMatchObject({ restaurantId: 7, authorId: 2, authorName: 'Иван Петров', authorRole: 'MANAGER', id: event.id });
    expect(JSON.stringify(data)).not.toContain('never');
    expect(data.update).toEqual({});
    await expect(audit.append(7, { id: 2, fullName: '', role: 'ADMIN' }, event)).rejects.toThrow();
  });
  it('fetches exactly 31 rows to produce pages of 30, newest first, with a stable cursor', async () => {
    const rows = Array.from({ length: 31 }, (_, n) => ({ ...event, id: String(100-n), restaurantId: 7,
      authorName: 'Иван', authorRole: 'ADMIN', authorId: 2, createdAt: new Date('2026-10-15T12:00:00Z') }));
    prisma.activityLog.findMany.mockResolvedValue(rows);
    const page = await audit.list(7);
    expect(page.items).toHaveLength(30); expect(page.nextCursor).toBeTruthy();
    expect(prisma.activityLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { restaurantId: 7 }, take: 31,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
    prisma.activityLog.findMany.mockResolvedValue([]);
    const next = await audit.list(7, page.nextCursor);
    expect(prisma.activityLog.findMany.mock.calls[1][0].where).toMatchObject({ restaurantId: 7, OR: [
      { createdAt: { lt: rows[29].createdAt } }, { createdAt: rows[29].createdAt, id: { lt: rows[29].id } },
    ] });
    expect(next).toEqual({ items: [], nextCursor: null });
  });
  it('rejects malformed cursors before reading the database', async () => {
    await expect(audit.list(7, 'invalid')).rejects.toThrow();
    expect(prisma.activityLog.findMany).not.toHaveBeenCalled();
  });
});
