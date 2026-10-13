import 'reflect-metadata';
import { AiRpcController } from '../src/messaging/ai-rpc.controller';
import { validateEnvironment } from '../src/config/environment';
import { ApiError } from '../src/common/api-error';
import { UpdService } from '../src/upd/upd.service';

describe('AI service RPC boundary', () => {
  const settings = validateEnvironment({ OPENROUTER_API_KEY: 'test-key', MAX_FILE_SIZE_MB: 1 });
  const data = { sellerName: null, items: [{ name: 'Молоко', quantity: 2, price: 100, totalPrice: 200, unit: 'шт' }] };
  let recognize: jest.Mock;
  let controller: AiRpcController;
  const payload = () => ({ file: { originalname: 'document.png', mimetype: 'image/png', base64: Buffer.from('image bytes').toString('base64') }, deadlineAt: Date.now() + 150000 });
  beforeEach(() => {
    recognize = jest.fn().mockResolvedValue(data);
    controller = new AiRpcController(settings, { recognize } as unknown as UpdService);
  });
  it('decodes a command and returns the shared result envelope', async () => {
    expect(await controller.recognize(payload())).toEqual({ success: true, data });
    expect(recognize).toHaveBeenCalledWith(expect.objectContaining({ originalname: 'document.png', mimetype: 'image/png', buffer: Buffer.from('image bytes'), size: 11 }));
  });
  it('rejects an expired command before inference', async () => {
    expect(await controller.recognize({ ...payload(), deadlineAt: Date.now() - 1 })).toMatchObject({ success: false, error: { status: 504, code: 'AI_REQUEST_EXPIRED' } });
    expect(recognize).not.toHaveBeenCalled();
  });
  it.each([undefined, {}, { file: { originalname: 'document.png', mimetype: 'image/png', base64: 'not base64!' }, deadlineAt: Date.now() + 150000 }])('rejects malformed commands: %j', async (value) => {
    expect(await controller.recognize(value)).toMatchObject({ success: false, error: { status: 400 } });
    expect(recognize).not.toHaveBeenCalled();
  });
  it('rejects an oversized decoded document before inference', async () => {
    const command = payload(); command.file.base64 = Buffer.alloc(1024 * 1024 + 1).toString('base64');
    expect(await controller.recognize(command)).toMatchObject({ success: false, error: { status: 413 } });
    expect(recognize).not.toHaveBeenCalled();
  });
  it('preserves safe service errors', async () => {
    recognize.mockRejectedValue(new ApiError(503, 'OPENROUTER_BILLING_ERROR', 'Пополните баланс'));
    expect(await controller.recognize(payload())).toEqual({ success: false, error: { status: 503, code: 'OPENROUTER_BILLING_ERROR', message: 'Пополните баланс' } });
  });
  it('does not expose unexpected internal exceptions', async () => {
    recognize.mockRejectedValue(new Error('secret sk-or-private'));
    const result = await controller.recognize(payload());
    expect(result).toMatchObject({ success: false, error: { status: 500, code: 'AI_INTERNAL_ERROR' } });
    expect(JSON.stringify(result)).not.toContain('sk-or-private');
  });
  it('exposes health without generating an OpenRouter request', async () => {
    expect(await controller.health()).toEqual({ success: true, data: { status: 'ok' } });
    expect(recognize).not.toHaveBeenCalled();
  });
});
