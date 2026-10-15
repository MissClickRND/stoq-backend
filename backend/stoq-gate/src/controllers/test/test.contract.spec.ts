import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TestController } from './test.controller';
import { SupplyController } from '../inventory/supplies/supplies.controller';
import { InventoryController } from '../inventory/inventory/inventory.controller';
import { CommandBusService } from '../../common/rabbitMQ/command-bus.service';

describe('additive lifecycle and test endpoints', () => {
  let app: any;
  const sendCommand = jest.fn();
  const originalEnvironment = process.env.NODE_ENV;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [TestController, SupplyController, InventoryController],
      providers: [{ provide: CommandBusService, useValue: { sendCommand } }] }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => { sendCommand.mockReset(); process.env.NODE_ENV = originalEnvironment; delete process.env.ENABLE_TEST_TOOLS; });
  afterEach(() => { process.env.NODE_ENV = originalEnvironment; delete process.env.ENABLE_TEST_TOOLS; delete process.env.ENABLE_DEMO_RESTAURANTS; });
  const dto = { supplyNumber: 'S1', supplier: 'ABC', status: 'IN_TRANSIT', items: [{ productId: 7, quantity: 2, totalPrice: 200, expiresAt: '2030-01-01' }] };
  it('forwards status on creation and routes editing through the existing command bus', async () => {
    sendCommand.mockResolvedValue({ success: true, data: { id: 4 } });
    await request(app.getHttpServer()).post('/supplies').send(dto).expect(201);
    expect(sendCommand.mock.calls[0][2].dto.status).toBe('IN_TRANSIT');
    await request(app.getHttpServer()).put('/supplies/4').send({ ...dto, status: 'RECEIVED' }).expect(200);
    expect(sendCommand.mock.calls[1][1]).toBe('command.inventory.update_supply');
    expect(sendCommand.mock.calls[1][2]).toMatchObject({ id: 4, dto: { status: 'RECEIVED' } });
    await request(app.getHttpServer()).put('/supplies/4').send({ ...dto, status: 'UNKNOWN' }).expect(400);
    expect(sendCommand).toHaveBeenCalledTimes(2);
  });
  it('writes off a batch without changing the inventory PUT contract', async () => {
    sendCommand.mockResolvedValue({ success: true, data: { availableQuantity: 0 } });
    await request(app.getHttpServer()).post('/inventory/9/write-off').expect(201);
    expect(sendCommand.mock.calls[0][2]).toEqual({ dto: { items: [{ batchId: 9, quantity: 0 }] }, operation: 'WRITE_OFF' });
    await request(app.getHttpServer()).put('/inventory').send({ items: [{ batchId: 9, quantity: 3 }] }).expect(200);
    expect(sendCommand.mock.calls[1][2]).toEqual({ dto: { items: [{ batchId: 9, quantity: 3 }] } });
  });
  it('requires confirmation and resets orders, inventory, then catalog', async () => {
    sendCommand.mockResolvedValue({ success: true, data: { count: 1 } });
    await request(app.getHttpServer()).post('/test/reset').send({}).expect(400);
    expect(sendCommand).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/test/reset').send({ confirmation: 'RESET' }).expect(201);
    expect(sendCommand.mock.calls.map(call => call[1])).toEqual([
      'command.order.reset_business_data', 'command.inventory.reset_business_data', 'command.catalog.reset_business_data',
    ]);
  });
  it('rejects a production reset and stops a partial reset on failure', async () => {
    process.env.NODE_ENV = 'production';
    await request(app.getHttpServer()).post('/test/reset').send({ confirmation: 'RESET' }).expect(403);
    expect(sendCommand).not.toHaveBeenCalled();
    process.env.NODE_ENV = 'test';
    sendCommand.mockResolvedValueOnce({ success: true, data: { orders: 1 } })
      .mockResolvedValueOnce({ success: false, error: { message: 'Unavailable', status: 503 } });
    const response = await request(app.getHttpServer()).post('/test/reset').send({ confirmation: 'RESET' }).expect(503);
    expect(response.body.completed).toEqual({ orders: { orders: 1 } });
    expect(sendCommand).toHaveBeenCalledTimes(2);
  });

  it('keeps destructive resets disabled when only production demo restaurants are enabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEMO_RESTAURANTS = 'true';
    await request(app.getHttpServer()).post('/test/reset').send({ confirmation: 'RESET' }).expect(403);
    expect(sendCommand).not.toHaveBeenCalled();
  });
});
