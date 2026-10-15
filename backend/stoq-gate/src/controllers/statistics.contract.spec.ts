import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { StatisticsController } from './recommendation/statistics/statistics.controller';
import { InventoryController } from './inventory/inventory/inventory.controller';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../auth/auth.guard';
import { CommandBusService } from '../common/rabbitMQ/command-bus.service';

describe('Server statistics HTTP contracts', () => {
  let app: any;
  const sendCommand = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [StatisticsController, InventoryController, AuthController],
      providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard },
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: CommandBusService, useValue: { sendCommand } }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => sendCommand.mockReset().mockImplementation(async (_exchange, key, payload) => {
    if (key === 'command.auth.verify_access') return { success: true, data: { id: 1, restaurantId: 7, role: payload.accessToken, email: 'a@b.c', fullName: 'User' } };
    return { success: true, data: { value: null } };
  }));
  const get = (path: string, role = 'ADMIN') => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${role}`);
  it.each([
    ['/statistics/dashboard', 'command.recommendation.get_dashboard_statistics', { days: 14 }],
    ['/statistics/dashboard?days=30', 'command.recommendation.get_dashboard_statistics', { days: 30 }],
    ['/statistics/dishes/5', 'command.recommendation.get_dish_details_statistics', { id: 5, days: 7 }],
    ['/statistics/shortages?days=7', 'command.recommendation.get_shortage_statistics', { days: 7 }],
    ['/statistics/supplies', 'command.inventory.get_supply_statistics', {}],
    ['/statistics/supplies/3', 'command.inventory.get_supply_statistics', { id: 3 }],
    ['/inventory/statistics', 'command.inventory.get_statistics', {}],
    ['/inventory/write-offs', 'command.inventory.get_write_offs', {}],
    ['/auth/admin/statistics', 'command.auth.admin_statistics', { accessToken: 'ADMIN' }],
  ])('forwards %s to its owning service without losing nulls', async (path, key, payload) => {
    await get(path as string).expect(200, { value: null });
    expect(sendCommand).toHaveBeenLastCalledWith('app.commands', key, payload, ...(key === 'command.auth.admin_statistics' ? [expect.any(Object)] : []));
  });
  it.each(['/statistics/dashboard?days=0', '/statistics/dashboard?days=8', '/statistics/dashboard?days=7.5', '/statistics/dashboard?days=abc', '/statistics/dashboard?days=', '/statistics/shortages?days=90', '/statistics/dishes/1?days=14', '/statistics/dishes/0', '/statistics/supplies/-1'])('rejects invalid input before business RPC: %s', async (path) => {
    await get(path).expect(400);
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['WAITER', '/statistics/dashboard', 403], ['STOREKEEPER', '/statistics/dishes/1', 403],
    ['WAITER', '/statistics/shortages', 403], ['MANAGER', '/auth/admin/statistics', 403],
    ['STOREKEEPER', '/statistics/supplies', 200], ['WAITER', '/inventory/statistics', 200],
    ['STOREKEEPER', '/inventory/write-offs', 200],
  ])('enforces role %s for %s', async (role, path, status) => { await get(path, role).expect(status); });
  it('forwards preview and optional report flags while retaining the legacy update shape', async () => {
    const dto = { items: [{ batchId: 2, quantity: 0, remove: true }], includeReport: true };
    await request(app.getHttpServer()).put('/inventory').set('Authorization', 'Bearer ADMIN').send(dto).expect(200);
    expect(sendCommand).toHaveBeenLastCalledWith('app.commands', 'command.inventory.update_quantity_inventory', { dto });
    const preview = { items: [{ batchId: 2, quantity: 1 }] };
    await request(app.getHttpServer()).post('/inventory/preview').set('Authorization', 'Bearer ADMIN').send(preview).expect(201);
    expect(sendCommand).toHaveBeenLastCalledWith('app.commands', 'command.inventory.preview', { dto: preview });
  });
  it.each([
    { items: [null] },
    { items: {} },
    { items: [{ batchId: 2, quantity: -1 }] },
    { items: [{ batchId: 2, quantity: 1 }, { batchId: 2, quantity: 2 }] },
    { items: [{ batchId: 2, quantity: 0, remove: 'true' }] },
    { items: [{ batchId: 2, quantity: 1 }], includeReport: 'true' },
  ])('rejects invalid inventory input', async (body) => {
    await request(app.getHttpServer()).post('/inventory/preview').set('Authorization', 'Bearer ADMIN').send(body).expect(400);
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });
  it('preserves service errors for unavailable statistics', async () => {
    sendCommand.mockImplementation(async (_exchange, key, payload) => key === 'command.auth.verify_access'
      ? { success: true, data: { id: 1, restaurantId: 7, role: payload.accessToken } }
      : { success: false, error: { status: 503, message: 'Statistics unavailable' } });
    await get('/statistics/dashboard').expect(503);
  });
});
