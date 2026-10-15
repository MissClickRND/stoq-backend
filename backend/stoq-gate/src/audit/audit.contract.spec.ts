import { Test } from '@nestjs/testing';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { OrderController } from '../controllers/order/order.controller';
import { InventoryController } from '../controllers/inventory/inventory/inventory.controller';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../auth/auth.guard';
import { CommandBusService } from '../common/rabbitMQ/command-bus.service';
import { RestaurantInterceptor } from '../common/tenant/restaurant.interceptor';

describe('Verified authors and activity HTTP integration', () => {
  let app: any;
  const sendCommand = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [OrderController, InventoryController, AuditController],
      providers: [AuditService, AuthService, { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_INTERCEPTOR, useClass: RestaurantInterceptor }, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
        { provide: ConfigService, useValue: new ConfigService() }, { provide: CommandBusService, useValue: { sendCommand } }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => sendCommand.mockReset().mockImplementation(async (_e, key, payload) => {
    if (key === 'command.auth.verify_access') return { success: true, data: { id: 4, restaurantId: 7, fullName: 'Иван Петров', role: payload.accessToken } };
    if (key === 'command.inventory.get_write_offs') return { success: true, data: [] };
    if (key === 'command.auth.get_activity') return { success: true, data: { items: [], nextCursor: null } };
    return { success: true, data: { id: 15 } };
  }));
  it('uses only authenticated creator identity and writes the successful operation', async () => {
    await request(app.getHttpServer()).post('/orders').set('Authorization', 'Bearer WAITER').send({}).expect(201);
    const create = sendCommand.mock.calls.find(c => c[1] === 'command.order.create_order');
    expect(create[2].creator).toEqual({ id: 4, name: 'Иван Петров', role: 'WAITER', source: 'EMPLOYEE' });
    const log = sendCommand.mock.calls.find(c => c[1] === 'command.auth.append_activity')[2];
    expect(log).toMatchObject({ restaurantId: 7, actor: { id: 4, fullName: 'Иван Петров' }, event: { title: 'Создан заказ', object: 'Заказ №15' } });
    await request(app.getHttpServer()).post('/orders').set('Authorization', 'Bearer WAITER').send({ createdById: 999 }).expect(400);
  });
  it('marks a public guest order explicitly', async () => {
    await request(app.getHttpServer()).post('/orders').set('X-Restaurant-Id', '7').send({}).expect(201);
    expect(sendCommand.mock.calls.find(c => c[1] === 'command.order.create_order')[2].creator).toMatchObject({ id: null, name: 'Гость', source: 'GUEST' });
  });
  it('does not audit failed operations or inventory preview', async () => {
    sendCommand.mockImplementation(async (_e, key) => key === 'command.auth.verify_access'
      ? { success: true, data: { id: 4, restaurantId: 7, fullName: 'Иван', role: 'ADMIN' } }
      : { success: false, error: { status: 409, message: 'Conflict' } });
    await request(app.getHttpServer()).post('/orders').set('Authorization', 'Bearer ADMIN').send({}).expect(409);
    expect(sendCommand.mock.calls.some(c => c[1] === 'command.auth.append_activity')).toBe(false);
  });
  it('restricts logs to managers/admins and forwards the cursor', async () => {
    await request(app.getHttpServer()).get('/logs').set('Authorization', 'Bearer WAITER').expect(403);
    await request(app.getHttpServer()).get('/logs?cursor=next').set('Authorization', 'Bearer MANAGER').expect(200, { items: [], nextCursor: null });
    expect(sendCommand).toHaveBeenLastCalledWith('app.commands', 'command.auth.get_activity', { accessToken: 'MANAGER', cursor: 'next' });
  });
});
