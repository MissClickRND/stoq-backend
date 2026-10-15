import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcrypt';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';

describe('Telegram sessions', () => {
  let auth: any;
  let user: any;
  let session: any;
  let prisma: any;
  beforeEach(async () => {
    user = { id: 1, fullName: 'Owner', email: 'owner@test.com', role: 'ADMIN', restaurantId: 7, tokenVersion: 2, blocked: false, passwordHash: await hash('password', 4), hashedRefreshToken: 'browser-session' };
    session = null;
    prisma = { user: { findUnique: jest.fn(async () => user), update: jest.fn() }, telegramSession: {
      upsert: jest.fn(async ({ create, update }) => { session = { ...session, ...(session ? update : create), user }; return session; }),
      findUnique: jest.fn(async ({ where }) => session?.tokenDigest === where.tokenDigest ? session : null),
      deleteMany: jest.fn(async ({ where }) => { if (session?.tokenDigest === where.tokenDigest && session.telegramUserId === where.telegramUserId) session = null; return { count: 1 }; }),
    } };
    auth = new AuthService(new JwtService(), new ConfigService(), prisma);
  });
  const login = (auth: any, id = '123') => auth.telegramLogin({ email: 'OWNER@test.com', password: 'password' }, id);
  it('stores only a digest, returns safe user and leaves browser refresh untouched', async () => {
    const result = await login(auth);
    expect(result.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(session.tokenDigest).toBe(createHash('sha256').update(result.sessionToken).digest('hex'));
    expect(JSON.stringify(session)).not.toContain(result.sessionToken);
    expect(result.user).toEqual({ id: 1, fullName: 'Owner', email: user.email, role: 'ADMIN', restaurantId: 7 });
    expect(Date.parse(result.expiresAt) - Date.now()).toBeGreaterThan(29 * 86400000);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it.each(['WAITER', 'STOREKEEPER', 'WAIT_CONFIRM'])('rejects role %s', async role => { user.role = role; await expect(login(auth)).rejects.toThrow(); });
  it('rejects wrong password and blocked accounts', async () => {
    await expect(auth.telegramLogin({ email: user.email, password: 'wrong' }, '123')).rejects.toThrow();
    user.blocked = true; await expect(login(auth)).rejects.toThrow();
    expect(prisma.telegramSession.upsert).not.toHaveBeenCalled();
  });
  it('rotates existing binding and revokes only Telegram on logout', async () => {
    const first = await login(auth); const second = await login(auth);
    await expect(auth.telegramVerify(first.sessionToken, '123')).rejects.toThrow();
    expect(await auth.telegramVerify(second.sessionToken, '123')).toEqual(second.user);
    await auth.telegramLogout(second.sessionToken, '123');
    await expect(auth.telegramVerify(second.sessionToken, '123')).rejects.toThrow();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it.each(['identity', 'expiry', 'version', 'blocked', 'role', 'tenant'])('rejects invalid %s', async reason => {
    const result = await login(auth);
    if (reason === 'expiry') session.expiresAt = new Date(0);
    if (reason === 'version') user.tokenVersion++;
    if (reason === 'blocked') user.blocked = true;
    if (reason === 'role') user.role = 'WAITER';
    if (reason === 'tenant') user.restaurantId++;
    await expect(auth.telegramVerify(result.sessionToken, reason === 'identity' ? '124' : '123')).rejects.toThrow();
  });
  it.each(['0', '-1', 'abc', '1'.repeat(21), 123])('rejects invalid Telegram identity %s', async id => {
    await expect(login(auth, id as string)).rejects.toThrow();
    expect(prisma.telegramSession.upsert).not.toHaveBeenCalled();
  });
});
