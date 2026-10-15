import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { HttpExceptionFilter } from './http-exception.filter';
import { CommandBusService } from '../../common/rabbitMQ/command-bus.service';
import { AiUploadInterceptor } from './ai-upload.interceptor';

describe('Gateway AI upload', () => {
  let app: INestApplication;
  const sendCommand = jest.fn();
  const result = {
    sellerName: 'ООО Поставщик',
    items: [
      { name: 'Молоко', quantity: 2, price: 100, totalPrice: 200, unit: 'шт' },
    ],
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        AiService,
        AiUploadInterceptor,
        HttpExceptionFilter,
        { provide: CommandBusService, useValue: { sendCommand } },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AI_RPC_TIMEOUT_MS: 150000,
            AI_MAX_FILE_SIZE_MB: 1,
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });
  beforeEach(() =>
    sendCommand.mockReset().mockResolvedValue({ success: true, data: result }),
  );
  afterAll(() => app?.close());
  it('returns AI recognition and sends base64 with an AI-specific timeout', async () => {
    await request(app.getHttpServer())
      .post('/ai')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(200, result);
    expect(sendCommand).toHaveBeenCalledWith(
      'app.commands',
      'command.ai.recognize_upd',
      expect.objectContaining({
        file: {
          originalname: 'sample.png',
          mimetype: 'image/png',
          base64: 'aW1hZ2U=',
        },
        deadlineAt: expect.any(Number),
      }),
      { timeoutMs: 150000 },
    );
  });
  it('rejects a missing file before RabbitMQ', async () => {
    await request(app.getHttpServer()).post('/ai').expect(400);
    expect(sendCommand).not.toHaveBeenCalled();
  });
  it('rejects oversized files before RabbitMQ', async () => {
    await request(app.getHttpServer())
      .post('/ai')
      .attach('file', Buffer.alloc(1024 * 1024 + 1), 'large.png')
      .expect(413);
    expect(sendCommand).not.toHaveBeenCalled();
  });
  it('rejects extra text fields', async () => {
    await request(app.getHttpServer())
      .post('/ai')
      .field('prompt', 'override')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(400);
    expect(sendCommand).not.toHaveBeenCalled();
  });
  it('preserves safe worker errors and never manufactures recognition', async () => {
    sendCommand.mockResolvedValue({
      success: false,
      error: {
        status: 422,
        code: 'NO_PRODUCTS',
        message: 'Не удалось прочитать товарные строки',
      },
    });
    const response = await request(app.getHttpServer())
      .post('/ai')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(422);
    expect(response.body.code).toBe('NO_PRODUCTS');
  });
  it('does not leak broker credentials on connection errors', async () => {
    sendCommand.mockRejectedValue(
      new Error('amqp://user:private-password@host'),
    );
    const response = await request(app.getHttpServer())
      .post('/ai')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(503);
    expect(JSON.stringify(response.body)).not.toContain('private-password');
  });
  it('reports RPC timeout as 504', async () => {
    sendCommand.mockRejectedValue(new Error('RPC timed out'));
    await request(app.getHttpServer())
      .post('/ai')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(504);
  });
  it('rejects malformed success data', async () => {
    sendCommand.mockResolvedValue({
      success: true,
      data: { sellerName: null, items: [{ quantity: 'bad' }] },
    });
    await request(app.getHttpServer())
      .post('/ai')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(502);
  });
  it('checks the worker health over the bus', async () => {
    sendCommand.mockResolvedValue({ success: true, data: { status: 'ok' } });
    await request(app.getHttpServer())
      .get('/ai/health')
      .expect(200, { status: 'ok' });
    expect(sendCommand).toHaveBeenCalledWith(
      'app.commands',
      'command.ai.health',
      {},
      { timeoutMs: 15000 },
    );
  });
  it('prepares a supply using the existing AI and catalog commands', async () => {
    const items = [
      {
        productId: 10,
        name: 'Молоко',
        quantity: 2,
        price: 100,
        totalPrice: 250,
        unit: { id: 1, name: 'Штука', shortName: 'шт' },
      },
    ];
    sendCommand
      .mockResolvedValueOnce({ success: true, data: result })
      .mockResolvedValueOnce({ success: true, data: items });
    await request(app.getHttpServer())
      .post('/ai/supply')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(200, { sellerName: result.sellerName, items });
    expect(sendCommand.mock.calls[1]).toEqual([
      'app.commands',
      'command.catalog.resolve_upd_products',
      { items: result.items },
      { timeoutMs: 30000 },
    ]);
  });
  it('does not resolve products when recognition fails', async () => {
    sendCommand.mockResolvedValue({
      success: false,
      error: { status: 422, message: 'Нет товаров' },
    });
    await request(app.getHttpServer())
      .post('/ai/supply')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(422);
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });
  it('preserves catalog validation errors', async () => {
    sendCommand
      .mockResolvedValueOnce({ success: true, data: result })
      .mockResolvedValueOnce({
        success: false,
        error: { status: 422, message: 'Не читается единица' },
      });
    const response = await request(app.getHttpServer())
      .post('/ai/supply')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(422);
    expect(response.body.message).toBe('Не читается единица');
  });
  it('rejects malformed catalog success data', async () => {
    sendCommand
      .mockResolvedValueOnce({ success: true, data: result })
      .mockResolvedValueOnce({ success: true, data: [{ productId: 'wrong' }] });
    await request(app.getHttpServer())
      .post('/ai/supply')
      .attach('file', Buffer.from('image'), 'sample.png')
      .expect(502);
  });
});
