// Real HTTP -> RabbitMQ -> auth -> PostgreSQL. Each run gets its own database and vhost.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const load = (service, file) => require(path.join(root, 'backend', service, file));
const { Pool } = load('stoq-auth-service', 'node_modules/pg');
const { parse } = load('stoq-auth-service', 'node_modules/dotenv');
const localConfig = path.join(root, 'docker/postgres/.env');
const postgres = fs.existsSync(localConfig) ? parse(fs.readFileSync(localConfig)) : {};
const adminUrl = process.env.AUTH_TEST_DATABASE_URL ?? `postgresql://${encodeURIComponent(postgres.POSTGRES_USER ?? 'admin')}:${encodeURIComponent(postgres.POSTGRES_PASSWORD ?? 'admin')}@127.0.0.1:${postgres.PORT ?? '5432'}/postgres`;
const broker = new URL(process.env.AUTH_TEST_RABBITMQ_URL ?? 'amqp://admin:admin@127.0.0.1:5672');
const management = process.env.AUTH_TEST_RABBITMQ_MANAGEMENT_URL ?? 'http://127.0.0.1:15672';
const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
const database = `stoq_auth_test_${suffix}`;
const vhost = `stoq_auth_test_${suffix}`;
const apps = [];
let databaseCreated = false;
let vhostCreated = false;

async function vhostRequest(method) {
  const response = await fetch(`${management}/api/vhosts/${encodeURIComponent(vhost)}`, {
    method, headers: { Authorization: `Basic ${Buffer.from(`${decodeURIComponent(broker.username)}:${decodeURIComponent(broker.password)}`).toString('base64')}` },
    signal: AbortSignal.timeout(10000),
  });
  assert.ok(response.ok, `Cannot ${method} the isolated test vhost: HTTP ${response.status}`);
}

async function main() {
  const admin = new Pool({ connectionString: adminUrl });
  try { await admin.query(`CREATE DATABASE "${database}"`); databaseCreated = true; } finally { await admin.end(); }
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${database}`;
  const pool = new Pool({ connectionString: databaseUrl.toString() });
  try {
    const migrations = path.join(root, 'backend/stoq-auth-service/prisma/migrations');
    for (const name of fs.readdirSync(migrations).sort()) {
      const file = path.join(migrations, name, 'migration.sql');
      if (fs.existsSync(file)) await pool.query(fs.readFileSync(file, 'utf8'));
    }
  } finally { await pool.end(); }
  await vhostRequest('PUT');
  vhostCreated = true;
  broker.pathname = `/${encodeURIComponent(vhost)}`;
  process.env.DATABASE_URL = databaseUrl.toString();
  process.env.RABBITMQ_URL = broker.toString();
  process.env.JWT_ACCESS_SECRET = randomBytes(32).toString('hex');
  process.env.JWT_REFRESH_SECRET = randomBytes(32).toString('hex');
  process.env.COOKIE_SECURE = 'false';
  process.env.COOKIE_SAMESITE = 'lax';
  process.env.NODE_ENV = 'test';

  // Business fixtures only; authentication, tokens, roles and employee records are real.
  const { Injectable } = load('stoq-auth-service', 'node_modules/@nestjs/common');
  const { RabbitRPC } = load('stoq-auth-service', 'node_modules/@golevelup/nestjs-rabbitmq');
  class BusinessFixtures {}
  Injectable()(BusinessFixtures);
  for (const key of ['command.inventory.get_supply', 'command.inventory.get_inventory', 'command.order.get_order',
    'command.recommendation.get_dish_statistics', 'command.recommendation.get_dependency_graph',
    'command.catalog.get_dishes', 'command.order.create_order']) {
    const name = key.replaceAll('.', '_');
    Object.defineProperty(BusinessFixtures.prototype, name, { value: async () => ({ success: true, data: [] }) });
    RabbitRPC({ exchange: 'app.commands', queue: 'auth.integration.business', routingKey: key })(
      BusinessFixtures.prototype, name, Object.getOwnPropertyDescriptor(BusinessFixtures.prototype, name));
  }
  const { Test: AuthTest } = load('stoq-auth-service', 'node_modules/@nestjs/testing');
  const { AppModule: AuthModule } = load('stoq-auth-service', 'dist/app.module');
  const authModule = await AuthTest.createTestingModule({ imports: [AuthModule], providers: [BusinessFixtures] }).compile();
  const auth = authModule.createNestApplication({ logger: false });
  apps.push(auth);
  await auth.init();

  const { Test: GateTest } = load('stoq-gate', 'node_modules/@nestjs/testing');
  const { AppModule: GateModule } = load('stoq-gate', 'dist/app.module');
  const { ValidationPipe } = load('stoq-gate', 'node_modules/@nestjs/common');
  const cookieParser = load('stoq-gate', 'node_modules/cookie-parser');
  const gateModule = await GateTest.createTestingModule({ imports: [GateModule] }).compile();
  const gate = gateModule.createNestApplication({ logger: false });
  apps.push(gate);
  gate.use(cookieParser());
  gate.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await gate.listen(0, '127.0.0.1');
  const base = await gate.getUrl();
  async function api(method, route, body, cookies, status = method === 'POST' ? 201 : 200) {
    const response = await fetch(base + route, { method,
      headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${route}: unexpected HTTP ${response.status}`);
    return { data, cookies: response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; '), response };
  }

  const password = 'test-password';
  const first = await api('POST', '/auth/register-restaurant', { fullName: 'First Owner', email: 'first@example.com', password, restaurantName: 'First Restaurant' });
  const second = await api('POST', '/auth/register-restaurant', { fullName: 'Second Owner', email: 'second@example.com', password, restaurantName: 'Second Restaurant' });
  const owner = await api('POST', '/auth/login', { email: 'FIRST@EXAMPLE.COM', password });
  assert.equal(owner.data.user.role, 'ADMIN');
  assert.equal(owner.data.user.restaurantId, first.data.restaurant.id);
  assert.ok(owner.response.headers.getSetCookie().every(cookie => cookie.includes('HttpOnly')));
  assert.ok(!('accessToken' in owner.data));

  for (const role of ['MANAGER', 'WAITER', 'STOREKEEPER']) {
    const email = `${role.toLowerCase()}@example.com`;
    const employee = await api('POST', '/auth/register-user', { fullName: role, email, password, restaurantId: first.data.restaurant.id });
    await api('POST', '/auth/login', { email, password }, undefined, 403);
    const pending = await api('GET', '/auth/admin/users/pending', undefined, owner.cookies);
    assert.ok(pending.data.some(user => user.id === employee.data.user.id));
    await api('PATCH', `/auth/admin/users/${employee.data.user.id}/approve`, { role }, owner.cookies);
    const login = await api('POST', '/auth/login', { email, password });
    await api('GET', '/auth/status', undefined, login.cookies);
    await api('GET', '/supplies', undefined, login.cookies);
    await api('GET', '/inventory', undefined, login.cookies, role === 'STOREKEEPER' ? 403 : 200);
    await api('GET', '/statistics/dishes', undefined, login.cookies, role === 'MANAGER' ? 200 : 403);
    await api('GET', '/auth/admin/users/pending', undefined, login.cookies, 403);
    if (role === 'WAITER') {
      await api('DELETE', `/auth/admin/users/${employee.data.user.id}`, undefined, owner.cookies);
      await api('GET', '/auth/status', undefined, login.cookies, 401);
    }
  }

  const outsider = await api('POST', '/auth/register-user', { fullName: 'Other Employee', email: 'other@example.com', password, restaurantId: second.data.restaurant.id });
  await api('PATCH', `/auth/admin/users/${outsider.data.user.id}/approve`, { role: 'WAITER' }, owner.cookies, 404);
  const pending = await api('GET', '/auth/admin/users/pending', undefined, owner.cookies);
  assert.ok(!pending.data.some(user => user.id === outsider.data.user.id));
  await api('PATCH', '/auth/admin/restaurant', { name: 'Updated Restaurant' }, owner.cookies);
  await api('GET', '/orders', undefined, undefined, 401);
  await api('GET', '/menu');
  await api('POST', '/orders', { items: [{ dishId: 1, quantity: 1 }] });
  const refreshed = await api('POST', '/auth/refresh', undefined, owner.cookies);
  assert.notEqual(refreshed.cookies, owner.cookies);
  await api('POST', '/auth/refresh', undefined, owner.cookies, 403);
  await api('POST', '/auth/logout', undefined, refreshed.cookies);
  await api('GET', '/auth/status', undefined, refreshed.cookies, 401);
  await api('POST', '/auth/refresh', undefined, refreshed.cookies, 401);
  console.log('Auth integration passed: real RabbitMQ/PostgreSQL, restaurant registration, employee approval, all roles, cookies, refresh rotation, logout, deletion, cross-restaurant admin checks and guest ordering.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  for (const app of apps.reverse()) await app.close();
  if (vhostCreated) await vhostRequest('DELETE');
  if (databaseCreated) {
    assert.match(database, /^stoq_auth_test_\d+_[a-f0-9]+$/);
    const admin = new Pool({ connectionString: adminUrl });
    try { await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); } finally { await admin.end(); }
  }
});
