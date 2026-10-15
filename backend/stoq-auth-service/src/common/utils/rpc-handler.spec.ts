import { Logger } from '@nestjs/common';
import { executeRpc } from './rpc-handler';

describe('auth RPC diagnostics', () => {
  it('logs schema failures on the server and keeps private details out of the RPC response and log', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    try {
      const error = Object.assign(new Error('postgresql://private:password@host/database'), { code: 'P2021' });
      expect(await executeRpc(async () => { throw error; })).toEqual({ success: false,
        error: { status: 500, message: 'Внутренняя ошибка auth-сервиса' } });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('P2021'), expect.any(String));
      expect(JSON.stringify(log.mock.calls)).not.toContain('private:password');
    } finally { log.mockRestore(); }
  });
});
