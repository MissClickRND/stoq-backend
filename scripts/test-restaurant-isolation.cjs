// Isolated database/vhost; real gateway, auth, catalog, inventory, orders and recommendations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const load = (service, file) => require(path.join(root, 'backend', service, file));
const { Pool } = load('stoq-auth-service', 'node_modules/pg');
const { parse } = load('stoq-auth-service', 'node_modules/dotenv');
const local = path.join(root, 'docker/postgres/.env');
const pg = fs.existsSync(local) ? parse(fs.readFileSync(local)) : {};
const adminUrl = process.env.AUTH_TEST_DATABASE_URL ?? `postgresql://${encodeURIComponent(pg.POSTGRES_USER ?? 'admin')}:${encodeURIComponent(pg.POSTGRES_PASSWORD ?? 'admin')}@127.0.0.1:${pg.PORT ?? '5432'}/postgres`;
const broker = new URL(process.env.AUTH_TEST_RABBITMQ_URL ?? 'amqp://admin:admin@127.0.0.1:5672');
const management = process.env.AUTH_TEST_RABBITMQ_MANAGEMENT_URL ?? 'http://127.0.0.1:15672';
const name = `stoq_tenant_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
const apps = [], sessions = [], cache = new Map();
let databaseCreated = false, vhostCreated = false;
async function vhost(method) {
  const response = await fetch(`${management}/api/vhosts/${encodeURIComponent(name)}`, { method,
    headers: { Authorization: `Basic ${Buffer.from(`${decodeURIComponent(broker.username)}:${decodeURIComponent(broker.password)}`).toString('base64')}` }, signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `Test vhost ${method}: ${response.status}`);
}
async function main() {
  const admin = new Pool({ connectionString: adminUrl });
  try { await admin.query(`CREATE DATABASE "${name}"`); databaseCreated = true; } finally { await admin.end(); }
  const databaseUrl = new URL(adminUrl); databaseUrl.pathname = `/${name}`;
  const pool = new Pool({ connectionString: databaseUrl.toString() });
  const services = ['stoq-auth-service','stoq-catalog-service','stoq-inventory-service','stoq-order-service','stoq-recommendation-service'];
  try {
    const cli = path.join(root, 'backend/stoq-catalog-service/node_modules/prisma/build/index.js');
    for (const service of services) {
      const sql = execFileSync(process.execPath, [cli, 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], {
        cwd: path.join(root, 'backend', service), encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl.toString() }, stdio: ['ignore','pipe','pipe'],
      });
      await pool.query(sql);
    }
  } finally { await pool.end(); }
  await vhost('PUT'); vhostCreated = true; broker.pathname = `/${name}`;
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: databaseUrl.toString(), RABBITMQ_URL: broker.toString(),
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'), COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'lax' });
  for (const service of [...services, 'stoq-gate']) {
    const { Test } = load(service, 'node_modules/@nestjs/testing');
    const { AppModule } = load(service, 'dist/app.module');
    let builder = Test.createTestingModule({ imports: [AppModule] });
    if (service === 'stoq-recommendation-service') {
      builder = builder.overrideProvider('REDIS_CLIENT').useValue({ get: async key => cache.get(key) ?? null,
        set: async (key, value) => { cache.set(key, value); }, del: async (...keys) => keys.forEach(key => cache.delete(key)) });
    }
    const module = await builder.compile();
    const app = module.createNestApplication({ logger: false }); apps.push(app);
    if (service === 'stoq-gate') {
      const { ValidationPipe } = load(service, 'node_modules/@nestjs/common');
      const { AuthService } = load(service, 'dist/auth/auth.service');
      const { AuthIoAdapter } = load(service, 'dist/auth/auth-io.adapter');
      app.use(load(service, 'node_modules/cookie-parser')());
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
      app.useWebSocketAdapter(new AuthIoAdapter(app, app.get(AuthService)));
    }
    await app.init();
  }
  const gate = apps.at(-1); await gate.listen(0, '127.0.0.1'); const base = await gate.getUrl();
  async function api(method, route, body, cookie, status = method === 'POST' ? 201 : 200, selected) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(selected ? { 'X-Restaurant-Id': String(selected) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(data)}`);
    return { data, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
  }
  const tenants = [];
  for (const n of [1,2]) {
    const account = { email: `owner${n}@example.com`, password: 'test-password' };
    const registration = await api('POST','/auth/register-restaurant',{...account,fullName:`Owner ${n}`,restaurantName:`Restaurant ${n}`});
    const { cookie } = await api('POST','/auth/login',account);
    const unit = (await api('POST','/product/units',{name:'Kilogram',shortName:'kg'},cookie)).data;
    const product = (await api('POST','/product',{name:'Tomatoes',unitId:unit.id},cookie)).data;
    const supplyBody = { supplyNumber:'SAME-NUMBER',supplier:'Supplier',items:[{productId:product.id,quantity:n*10,totalPrice:n*1000,expiresAt:'2030-01-01T00:00:00Z'}] };
    const supply = (await api('POST','/supplies',supplyBody,cookie)).data;
    const dish = (await api('POST','/dishes',{name:'Salad',salePrice:n*300,recipeItems:[{productId:product.id,quantity:1}]},cookie)).data;
    const order = (await api('POST','/orders',{items:[{dishId:dish.id,quantity:2}]},cookie)).data;
    const stock = (await api('GET','/inventory',undefined,cookie)).data;
    tenants.push({id:registration.data.restaurant.id,cookie,unit,product,supply,supplyBody,dish,order,batchId:stock[0].id});
  }
  const [a,b] = tenants;
  assert.equal((await api('GET','/restaurants')).data.length,2);
  for (const current of tenants) {
    const other = current === a ? b : a;
    for (const [route, id] of [['product',current.product.id],['dishes',current.dish.id],['supplies',current.supply.id],['orders',current.order.id]]) {
      assert.deepEqual((await api('GET',`/${route}`,undefined,current.cookie)).data.map(row=>row.id),[id]);
      await api('GET',`/${route}/${other[route==='product'?'product':route==='dishes'?'dish':route==='supplies'?'supply':'order'].id}`,undefined,current.cookie,404);
    }
    await api('GET','/orders',undefined,current.cookie,403,other.id);
    await api('DELETE',`/product/${other.product.id}`,undefined,current.cookie,404);
    await api('POST','/product',{name:'Wrong unit',unitId:other.unit.id},current.cookie,404);
    await api('POST','/dishes',{name:'Wrong ingredient',salePrice:100,recipeItems:[{productId:other.product.id,quantity:1}]},current.cookie,400);
    await api('POST','/supplies',{...current.supplyBody,supplyNumber:'FOREIGN',items:[{...current.supplyBody.items[0],productId:other.product.id}]},current.cookie,400);
    await api('PUT',`/supplies/${other.supply.id}`,current.supplyBody,current.cookie,404);
    await api('POST',`/inventory/${other.batchId}/write-off`,{},current.cookie,404);
    await api('PUT','/inventory',{items:[{batchId:other.batchId,quantity:0}]},current.cookie,404);
    await api('POST','/orders',{items:[{dishId:other.dish.id,quantity:1}]},current.cookie,404);
    await api('PATCH',`/orders/${other.order.id}/status`,{status:'completed'},current.cookie,404);
  }
  await api('PATCH',`/orders/${a.order.id}/status`,{status:'completed'},a.cookie);
  assert.equal((await api('GET','/inventory',undefined,a.cookie)).data[0].availableQuantity,8);
  assert.equal((await api('GET','/inventory',undefined,b.cookie)).data[0].availableQuantity,20);
  assert.equal((await api('GET','/statistics/orders/today',undefined,a.cookie)).data.completed,1);
  assert.equal((await api('GET','/statistics/orders/today',undefined,b.cookie)).data.completed,0);
  for (const current of tenants) {
    const graph = (await api('GET','/analytics/graph',undefined,current.cookie)).data;
    assert.ok(graph.nodes.some(node=>node.id===`dish:${current.dish.id}`));
    assert.ok(!graph.nodes.some(node=>node.id===`dish:${(current===a?b:a).dish.id}`));
    const recommendations=(await api('GET','/recommendations/dishes',undefined,current.cookie)).data;
    assert.ok(recommendations.every(row=>row.dishId===current.dish.id));
  }
  assert.ok([...cache.keys()].some(key=>key.includes(`restaurant:${a.id}:`)));
  assert.ok([...cache.keys()].some(key=>key.includes(`restaurant:${b.id}:`)));
  await api('GET','/menu',undefined,undefined,400);
  assert.deepEqual((await api('GET','/menu',undefined,undefined,200,a.id)).data.map(row=>row.id),[a.dish.id]);
  await api('POST','/orders',{items:[{dishId:a.dish.id,quantity:1}]},undefined,201,a.id);
  await api('POST','/orders',{items:[{dishId:b.dish.id,quantity:1}]},undefined,404,a.id);
  const { CommandBusService } = load('stoq-gate','dist/common/rabbitMQ/command-bus.service');
  const raw = gate.get(CommandBusService).amqpConnection;
  const missing = await raw.request({ exchange:'app.commands',routingKey:'command.order.get_order',payload:{},timeout:5000 });
  assert.equal(missing.error.status,400);
  const forged = await raw.request({ exchange:'app.commands',routingKey:'command.order.get_order_by_id',headers:{restaurantId:a.id},payload:{id:b.order.id,restaurantId:b.id},timeout:5000 });
  assert.equal(forged.error.status,404);
  // Real polling clients must receive only their restaurant's broadcast.
  async function packet(url, cookie, body) {
    const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'text/plain;charset=UTF-8'})},body,signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200); return response.text();
  }
  async function connect(tenant) {
    const endpoint=`${base}/socket.io/?EIO=4&transport=polling`;const handshake=await packet(endpoint,tenant.cookie);
    const url=`${endpoint}&sid=${JSON.parse(handshake.slice(1)).sid}`;sessions.push({url,cookie:tenant.cookie});
    await packet(url,tenant.cookie,'40/inventory,');assert.match(await packet(url,tenant.cookie),/^40\/inventory,/);return url;
  }
  const socketA=await connect(a),socketB=await connect(b);
  const { InventoryWsGateway }=load('stoq-gate','dist/controllers/inventory/inventory/inventory.ws.gateway');
  const { restaurantStorage }=load('stoq-gate','dist/common/tenant/restaurant-context');
  const gateway=gate.get(InventoryWsGateway);
  await restaurantStorage.run(a.id,()=>gateway.broadcastBatchExpired({eventId:'isolation',occurredAt:new Date().toISOString(),batchId:a.batchId,productId:a.product.id,lostQuantity:'1',expiredAt:new Date().toISOString()}));
  gateway.server.to(`restaurant:${b.id}`).emit('test:sentinel',{});
  assert.ok((await packet(socketA,a.cookie)).includes('inventory:batchExpired'));
  const otherEvents=await packet(socketB,b.cookie);assert.ok(otherEvents.includes('test:sentinel'));assert.ok(!otherEvents.includes('inventory:batchExpired'));
  for (const session of sessions.splice(0)) await packet(session.url,session.cookie,'1').catch(()=>{});
  await api('POST','/test/reset',{confirmation:'RESET'},a.cookie);
  assert.equal((await api('GET','/orders',undefined,a.cookie)).data.length,0);
  assert.equal((await api('GET','/orders',undefined,b.cookie)).data.length,1);
  assert.equal((await api('GET','/supplies',undefined,b.cookie)).data.length,1);
  assert.equal((await api('GET','/inventory',undefined,b.cookie)).data[0].availableQuantity,20);
  console.log('Restaurant isolation passed: real HTTP/RabbitMQ/PostgreSQL, duplicate names/numbers, ID and foreign-key attacks, tenant stock deduction, statistics, cache, guest selection, RPC rejection, Socket.IO rooms and scoped reset.');
}
main().catch(error=>{console.error(error.stack ?? error.message);process.exitCode=1;}).finally(async()=>{
  for(const app of apps.reverse()) await app.close();
  if(vhostCreated) await vhost('DELETE');
  if(databaseCreated) { assert.match(name,/^stoq_tenant_test_\d+_[a-f0-9]+$/);const admin=new Pool({connectionString:adminUrl});try{await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}finally{await admin.end();} }
});
