import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Controller, Get, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { RestaurantsController } from './restaurants.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CommandBusService } from '../common/rabbitMQ/command-bus.service';
import { ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';
import { InventoryController } from '../controllers/inventory/inventory/inventory.controller';
import { SupplyController } from '../controllers/inventory/supplies/supplies.controller';
import { OrderController } from '../controllers/order/order.controller';
import { DishesController } from '../controllers/catalog/dishes/dishes.controller';
import { ProductController } from '../controllers/catalog/product/product.controller';
import { StatisticsController } from '../controllers/recommendation/statistics/statistics.controller';
import { DependencyGraphController } from '../controllers/analytics/dependency-graph.controller';
import { MenuController } from '../controllers/catalog/dishes/menu.controller';
import { TestController } from '../controllers/test/test.controller';
import { ThrottlerModule } from '@nestjs/throttler';

@Controller('new-section')
class NewController {
  @Get() get() {
    return { ok: true };
  }
}

describe('Gateway authentication over RPC', () => {
  let app: any;
  const sendCommand = jest.fn();
  const user = {
    id: 1,
    fullName: 'Owner',
    email: 'owner@example.com',
    role: 'ADMIN',
    restaurantId: 7,
  };
  const session = {
    user,
    accessToken: 'access-value',
    refreshToken: 'refresh-value',
    accessMaxAgeMs: 900000,
    refreshMaxAgeMs: 604800000,
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [
        AuthController,
        RestaurantsController,
        InventoryController,
        SupplyController,
        OrderController,
        DishesController,
        ProductController,
        StatisticsController,
        DependencyGraphController,
        MenuController,
        TestController,
        NewController,
      ],
      providers: [
        AuthService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: CommandBusService, useValue: { sendCommand } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() =>
    sendCommand
      .mockReset()
      .mockImplementation(async (_exchange, key, payload) => {
        if (key === ROUTING_KEYS.AUTH_VERIFY_ACCESS) {
          if (payload.accessToken === 'unavailable')
            throw new Error('broker timeout');
          if (
            payload.accessToken === 'invalid' ||
            payload.accessToken === 'WAIT_CONFIRM'
          )
            return {
              success: false,
              error: { status: 401, message: 'Сессия недействительна' },
            };
          return {
            success: true,
            data: { ...user, role: payload.accessToken },
          };
        }
        if ([ROUTING_KEYS.AUTH_LOGIN, ROUTING_KEYS.AUTH_REFRESH].includes(key))
          return { success: true, data: session };
        if (key === ROUTING_KEYS.GET_DISHES)
          return {
            success: true,
            data: [
              {
                id: 3,
                name: 'Soup',
                category: 'Food',
                salePrice: 100,
                availablePortions: 5,
                costPrice: 20,
                recipeItems: [{ stock: 50 }],
              },
            ],
          };
        return { success: true, data: [] };
      }),
  );

  it.each([
    ['ADMIN', '/inventory', 200],
    ['MANAGER', '/statistics/dishes', 200],
    ['WAITER', '/inventory', 200],
    ['WAITER', '/orders', 200],
    ['WAITER', '/dishes', 200],
    ['WAITER', '/supplies', 200],
    ['WAITER', '/statistics/dishes', 403],
    ['WAITER', '/analytics/graph', 403],
    ['STOREKEEPER', '/supplies', 200],
    ['STOREKEEPER', '/product', 200],
    ['STOREKEEPER', '/product/units', 200],
    ['STOREKEEPER', '/inventory', 200],
    ['STOREKEEPER', '/inventory/expiring?daysThreshold=7', 200],
    ['STOREKEEPER', '/orders', 403],
    ['STOREKEEPER', '/dishes', 403],
    ['STOREKEEPER', '/statistics/dishes', 403],
    ['MANAGER', '/auth/admin/users/pending', 403],
    ['ADMIN', '/auth/admin/users/pending', 200],
    ['ADMIN', '/auth/admin/users', 200],
    ['MANAGER', '/auth/admin/users', 403],
    ['ADMIN', '/auth/admin/restaurant', 200],
    ['WAITER', '/auth/admin/restaurant', 403],
    ['ADMIN', '/auth/admin/invitations', 200],
    ['STOREKEEPER', '/auth/admin/invitations', 403],
    ['WAIT_CONFIRM', '/supplies', 401],
    ['invalid', '/orders', 401],
    ['unavailable', '/orders', 503],
    ['ADMIN', '/new-section', 200],
    ['WAITER', '/new-section', 403],
  ])('%s → %s returns %s', async (role, path, status) => {
    await request(app.getHttpServer())
      .get(path)
      .set('Cookie', `accessToken=${role}`)
      .expect(status);
    if (status !== 200) expect(sendCommand).toHaveBeenCalledTimes(1);
  });

  it('requires a session by default and supports Bearer authentication', async () => {
    await request(app.getHttpServer()).get('/inventory').expect(401);
    expect(sendCommand).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .get('/inventory')
      .set('Authorization', 'Bearer WAITER')
      .expect(200);
  });

  it('lists restaurants publicly and rejects an employee selecting another restaurant', async () => {
    await request(app.getHttpServer()).get('/restaurants').expect(200, []);
    expect(sendCommand).toHaveBeenLastCalledWith('app.commands', ROUTING_KEYS.AUTH_GET_RESTAURANTS, {}, { timeoutMs: 10000 });
    sendCommand.mockClear();
    await request(app.getHttpServer()).get('/inventory').set('Cookie', 'accessToken=ADMIN').set('X-Restaurant-Id', '8').expect(403);
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '0', '-1', 'abc', '7.5'])('rejects a guest restaurant header %s before RPC', async selected => {
    let call = request(app.getHttpServer()).get('/menu');
    if (selected !== undefined) call = call.set('X-Restaurant-Id', selected);
    await call.expect(400);
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('exposes the guest menu and order creation without internal stock or cost data', async () => {
    await request(app.getHttpServer())
      .get('/menu')
      .set('X-Restaurant-Id', '7')
      .expect(200, [
        {
          id: 3,
          name: 'Soup',
          category: 'Food',
          salePrice: 100,
          available: true,
        },
      ]);
    await request(app.getHttpServer())
      .post('/orders')
      .set('X-Restaurant-Id', '7')
      .send({ items: [{ dishId: 3, quantity: 1 }] })
      .expect(201);
    expect(
      sendCommand.mock.calls.every(
        (call) => call[1] !== ROUTING_KEYS.AUTH_VERIFY_ACCESS,
      ),
    ).toBe(true);
    await request(app.getHttpServer()).get('/orders/1').expect(401);
    await request(app.getHttpServer())
      .post('/orders')
      .set('Cookie', 'accessToken=STOREKEEPER')
      .send({})
      .expect(403);
  });

  it('sets HttpOnly cookies on the gateway and keeps tokens out of the JSON response', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'OWNER@EXAMPLE.COM', password: 'password' })
      .expect(201);
    expect(response.body).toEqual({ user });
    expect(response.headers['set-cookie']).toEqual([
      expect.stringMatching(
        /^accessToken=access-value; Max-Age=900; Path=\/;.*HttpOnly; SameSite=Lax$/,
      ),
      expect.stringMatching(
        /^refreshToken=refresh-value; Max-Age=604800; Path=\/auth;.*HttpOnly; SameSite=Lax$/,
      ),
    ]);
    expect(sendCommand).toHaveBeenCalledWith(
      'app.commands',
      ROUTING_KEYS.AUTH_LOGIN,
      { dto: { email: 'owner@example.com', password: 'password' } },
      { timeoutMs: 10000 },
    );
  });

  it('refreshes without an access token and clears cookies on logout', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    expect(sendCommand).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', 'refreshToken=refresh-value')
      .expect(201, { user });
    expect(sendCommand).toHaveBeenLastCalledWith(
      'app.commands',
      ROUTING_KEYS.AUTH_REFRESH,
      { refreshToken: 'refresh-value' },
      { timeoutMs: 10000 },
    );
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', 'accessToken=WAITER')
      .expect(201, { ok: true });
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('accessToken=; Path=/;'),
      expect.stringContaining('refreshToken=; Path=/auth;'),
    ]);
  });

  it('returns the current role and restaurant on status', async () => {
    await request(app.getHttpServer())
      .get('/auth/status')
      .set('Cookie', 'accessToken=STOREKEEPER')
      .expect(200, {
        authenticated: true,
        user: { ...user, role: 'STOREKEEPER' },
      });
  });

  it('validates roles and rejects spoofed identity fields before forwarding admin RPC', async () => {
    await request(app.getHttpServer())
      .patch('/auth/admin/users/2/approve')
      .set('Cookie', 'accessToken=ADMIN')
      .send({ role: 'ADMIN' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/auth/admin/users/2/approve')
      .set('Cookie', 'accessToken=ADMIN')
      .send({ role: 'WAITER', adminId: 99 })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/auth/admin/users/2/approve')
      .set('Cookie', 'accessToken=ADMIN')
      .send({ role: 'WAITER' })
      .expect(200);
    expect(sendCommand).toHaveBeenLastCalledWith(
      'app.commands',
      ROUTING_KEYS.AUTH_APPROVE_USER,
      { accessToken: 'ADMIN', id: 2, dto: { role: 'WAITER' } },
      { timeoutMs: 10000 },
    );
  });

  it('rejects malformed email fields and limits repeated login attempts before RPC', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 123, password: 'password' })
      .expect(400);
    for (let i = 0; i < 12; i++)
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'password' });
    sendCommand.mockClear();
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'password' })
      .expect(429);
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('validates role, block and invitation mutations and forwards the existing RPC envelope', async () => {
    await request(app.getHttpServer()).patch('/auth/admin/users/2/role').set('Cookie', 'accessToken=ADMIN').send({ role: 'WAIT_CONFIRM' }).expect(400);
    await request(app.getHttpServer()).patch('/auth/admin/users/2/block').set('Cookie', 'accessToken=ADMIN').send({ blocked: 'true' }).expect(400);
    await request(app.getHttpServer()).post('/auth/admin/invitations').set('Cookie', 'accessToken=ADMIN').send({ role: 'WAITER', hours: 0 }).expect(400);
    await request(app.getHttpServer()).patch('/auth/admin/users/2/role').set('Cookie', 'accessToken=MANAGER').send({ role: 'ADMIN' }).expect(403);
    await request(app.getHttpServer()).patch('/auth/admin/users/2/role').set('Cookie', 'accessToken=ADMIN').send({ role: 'ADMIN' }).expect(200);
    expect(sendCommand).toHaveBeenLastCalledWith('app.commands', ROUTING_KEYS.AUTH_SET_USER_ROLE, { accessToken: 'ADMIN', id: 2, dto: { role: 'ADMIN' } }, { timeoutMs: 10000 });
    const id = '9a8997f7-c425-4719-8d44-ac72d48136ae';
    await request(app.getHttpServer()).patch(`/auth/admin/invitations/${id}/revoke`).set('Cookie', 'accessToken=ADMIN').expect(200);
    expect(sendCommand).toHaveBeenLastCalledWith('app.commands', ROUTING_KEYS.AUTH_REVOKE_INVITATION, { accessToken: 'ADMIN', id }, { timeoutMs: 10000 });
  });

  it('accepts a restaurant-scoped invitation on public registration and rejects caller-provided roles', async () => {
    const dto = { fullName: 'New User', email: 'new@example.com', password: 'password', restaurantId: 7, invitationId: '9a8997f7-c425-4719-8d44-ac72d48136ae' };
    await request(app.getHttpServer()).post('/auth/register-user').send({ ...dto, role: 'ADMIN' }).expect(400);
    await request(app.getHttpServer()).post('/auth/register-user').send(dto).expect(201);
    expect(sendCommand).toHaveBeenLastCalledWith('app.commands', ROUTING_KEYS.AUTH_REGISTER_USER, { dto }, { timeoutMs: 10000 });
  });

  it('allows clearing optional restaurant contact fields', async () => {
    await request(app.getHttpServer()).patch('/auth/admin/restaurant').set('Cookie', 'accessToken=ADMIN').send({ email: '', phone: '  ' }).expect(200);
    expect(sendCommand).toHaveBeenLastCalledWith('app.commands', ROUTING_KEYS.AUTH_UPDATE_RESTAURANT, { accessToken: 'ADMIN', dto: { email: null, phone: null } }, { timeoutMs: 10000 });
  });
});
