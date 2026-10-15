import { AuthRPCController } from './auth-rpc.controller';

describe('Telegram RPC validation', () => {
  it('rejects additional credential properties', async () => {
    const auth = { telegramLogin: jest.fn() };
    const rpc: any = new AuthRPCController(auth as any);
    const result = await rpc.telegramLogin({ dto: { email: 'owner@test.com', password: 'password', role: 'ADMIN' }, telegramUserId: '123' });
    expect(result.success).toBe(false);
    expect(auth.telegramLogin).not.toHaveBeenCalled();
  });
});
