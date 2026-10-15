// Uses only dedicated local test PostgreSQL (55434) and RabbitMQ (5678).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const servicePath = name => path.join(root, 'backend', name);
const load = (name, file) => require(path.join(servicePath(name), file));
const { Pool } = load('stoq-inventory-service', 'node_modules/pg');
const adminUrl = 'postgresql://postgres:stoq_test_only@127.0.0.1:55434/stoq_contracts';
const apps = [], clients = [];

async function main() {
  const database = 'stoq_contracts_' + Date.now();
  const admin = new Pool({ connectionString: adminUrl });
  try { await admin.query('CREATE DATABASE "' + database + '"'); } finally { await admin.end(); }
  const url = adminUrl.replace('/stoq_contracts', '/' + database);
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, 'fixtures/contracts/baseline.sql'), 'utf8'));
    await pool.query(`INSERT INTO supply.supplies (supply_number) VALUES ('LEGACY');
      INSERT INTO "Order" (created_at, updated_at) VALUES ('2026-10-12 12:30:00', '2026-10-12 12:30:00');
      INSERT INTO "OrderItem" ("orderId", "dishId", quantity) VALUES (1, 1, 1);`);
    for (const [name, migration] of [
      ['stoq-inventory-service', '20261013100000_supply_prices'],
      ['stoq-catalog-service', '20261013100000_dish_category'],
      ['stoq-order-service', '20261013100000_order_metadata'],
      ['stoq-order-service', '20261013120000_order_item_prices'],
      ['stoq-order-service', '20261015183000_order_creator'],
    ]) await pool.query(fs.readFileSync(path.join(servicePath(name), 'prisma/migrations', migration, 'migration.sql'), 'utf8'));
    const legacy = (await pool.query('SELECT supplier, total_price FROM supply.supplies')).rows[0];
    assert.deepEqual(legacy, { supplier: null, total_price: null });
    const oldOrder = (await pool.query('SELECT date FROM "Order"')).rows[0];
    assert.equal(oldOrder.date.toISOString(), '2026-10-12T12:30:00.000Z');
    assert.deepEqual((await pool.query('SELECT name, price FROM "OrderItem" WHERE id = 1')).rows[0], { name: null, price: null });
    await pool.query(`CREATE TABLE IF NOT EXISTS inventory.stock_movements (
      id SERIAL PRIMARY KEY, order_id TEXT NOT NULL, batch_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
      quantity DECIMAL NOT NULL, type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS inventory.idempotency_keys (
      key TEXT PRIMARY KEY, order_id TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now());`);
    for (const name of ['stoq-catalog-service', 'stoq-inventory-service', 'stoq-order-service']) {
      await pool.query(fs.readFileSync(path.join(servicePath(name), 'prisma/migrations/20261015160000_restaurant_isolation/migration.sql'), 'utf8'));
    }
    for (const table of ['"Unit"','"Product"','"Dish"','supply.supplies','inventory.batches','inventory.stock_movements','inventory.idempotency_keys','"Order"']) {
      await pool.query(`UPDATE ${table} SET "restaurantId" = 1 WHERE "restaurantId" IS NULL`);
    }
    console.log('Additive migrations preserve legacy data; unknown prices stay null.');
  } finally { await pool.end(); }

  process.env.DATABASE_URL = url;
  process.env.RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:5678';
  process.env.AI_RPC_TIMEOUT_MS = '150000';
  for (const name of ['stoq-catalog-service', 'stoq-inventory-service', 'stoq-order-service', 'stoq-recommendation-service', 'stoq-gate']) {
    const { Test } = load(name, 'node_modules/@nestjs/testing');
    const { AppModule } = load(name, 'dist/app.module.js');
    let builder = Test.createTestingModule({ imports: [AppModule] });
    if (name === 'stoq-gate') {
      // This suite does not run auth; dedicated activity tests exercise its real audit store.
      const { AuditService } = load(name, 'dist/audit/audit.service.js');
      builder = builder.overrideProvider(AuditService).useValue({ record: async () => undefined });
      // This suite isolates business contracts; test-auth-integration.cjs covers real authentication.
      const { AuthService } = load(name, 'dist/auth/auth.service.js');
      builder = builder.overrideProvider(AuthService).useValue({ verifyAccess: async () => ({
        id: 1, fullName: 'Business Test Admin', email: 'business@example.com', role: 'ADMIN', restaurantId: 1,
      }) });
    }
    if (name !== 'stoq-gate') {
      const { PrismaService } = load(name, 'dist/prisma/prisma.service.js');
      const client = new PrismaService();
      clients.push([name, client]);
      builder = builder.overrideProvider(PrismaService).useValue(client);
    }
    const module = await builder.compile();
    const app = module.createNestApplication({ logger: false });
    apps.push(app);
    if (name === 'stoq-gate') {
      const { ValidationPipe } = load(name, 'node_modules/@nestjs/common');
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    }
    await app.init();
  }
  const gate = apps.at(-1);
  await gate.listen(0, '127.0.0.1');
  const base = await gate.getUrl();
  async function api(method, route, body, status = method === 'POST' ? 201 : 200) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer business-test-admin' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    assert.equal(response.status, status, route + ': ' + JSON.stringify(data));
    return data;
  }
  const unit = await api('POST', '/product/units', { name: 'Килограмм', shortName: 'кг' });
  const product = await api('POST', '/product', { name: 'Помидоры', unitId: unit.id });
  const sugar = await api('POST', '/product', { name: 'Сахар', unitId: unit.id });
  const expiresAt = '2030-01-01T00:00:00.000Z';
  const first = await api('POST', '/supplies', { supplyNumber: 'S1', supplier: 'Поставщик 1',
    items: [{ productId: product.id, quantity: 10, totalPrice: 1000, expiresAt },
      { productId: sugar.id, quantity: 0.125, totalPrice: 1.25, expiresAt }] });
  const second = await api('POST', '/supplies', { supplyNumber: 'S2', supplier: 'Поставщик 2',
    items: [{ productId: product.id, quantity: 5, totalPrice: 600, expiresAt }] });
  assert.equal(first.supplier, 'Поставщик 1');
  assert.equal(first.totalPrice, 1001.25);
  assert.equal(first.items[1].price, 10);
  assert.equal(first.items[0].price, 100);
  assert.equal(second.items[0].price, 120);
  assert.deepEqual(await api('GET', '/supplies/' + first.id), first);
  const listing = await api('GET', '/supplies?search=' + encodeURIComponent('Поставщик 1'));
  assert.equal(listing.length, 1); assert.equal(listing[0].totalPrice, 1001.25);
  const byProduct = await api('GET', '/supplies?search=' + encodeURIComponent('Помидоры'));
  assert.equal(byProduct.find(row => row.id === first.id).items.length, 2);
  const warehouse = (await api('GET', '/inventory')).filter(row => row.productId === product.id);
  assert.equal(warehouse.length, 2);
  assert.deepEqual(warehouse.map(row => row.price).sort((a, b) => a - b), [100, 120]);
  assert.equal((await api('GET', '/inventory/' + product.id)).length, 2);
  const dish = await api('POST', '/dishes', { name: 'Салат', category: 'Салаты', salePrice: 300,
    recipeItems: [{ productId: product.id, quantity: 0.5 }] });
  assert.equal(dish.category, 'Салаты'); assert.equal(dish.availablePortions, 30);
  assert.equal(dish.recipeItems[0].stock, 15); assert.equal(dish.recipeItems[0].price, 106.666667);
  assert.deepEqual(await api('GET', '/dishes/' + dish.id), dish);
  assert.equal((await api('GET', '/dishes'))[0].availablePortions, 30);
  const graph = await api('GET', '/analytics/graph');
  assert.deepEqual(graph.nodes.find(node => node.id === 'product:' + product.id), {
    id: 'product:' + product.id, type: 'ingredient', data: { name: product.name, quantity: 15, unit: 'кг', status: 'available' },
  });
  assert.equal(graph.edges[0].id, 'recipe:' + dish.recipeItems[0].id);
  assert.equal(graph.edges[0].data.required, 0.5);
  assert.equal(graph.edges[0].data.status, 'available');
  const metadata = { date: '2026-10-13T12:30:00.000Z', type: 'dine-in', table: 3, guests: 4 };
  const order = await api('POST', '/orders', { ...metadata, items: [{ dishId: dish.id, quantity: 2 }] });
  assert.equal(order.totalPrice, 600);
  assert.equal(order.items[0].price, 300);
  assert.equal(order.items[0].totalPrice, 600);
  assert.equal(order.items[0].name, 'Салат');
  const catalog = clients.find(([name]) => name === 'stoq-catalog-service')[1];
  await catalog.dish.update({ where: { id: dish.id }, data: { salePrice: 900, name: 'Салат с новой ценой' } });
  for (const [key, value] of Object.entries(metadata)) assert.equal(order[key], value);
  assert.deepEqual(await api('GET', '/orders/' + order.id), order);
  assert.ok((await api('GET', '/orders')).some(row => row.id === order.id && row.guests === 4));
  const soup = await api('POST', '/dishes', { name: 'Суп', salePrice: 12.34,
    recipeItems: [{ productId: product.id, quantity: 0.2 }] });
  const expandedOrder = await api('POST', '/orders/' + order.id + '/items', { items: [{ dishId: soup.id, quantity: 3 }] });
  assert.equal(expandedOrder.totalPrice, 637.02);
  assert.equal(expandedOrder.items.find(item => item.dishId === dish.id).price, 300);
  assert.equal(expandedOrder.items.find(item => item.dishId === soup.id).totalPrice, 37.02);
  const takeaway = await api('POST', '/orders', { date: metadata.date, type: 'takeaway', table: 3, guests: 1 });
  assert.equal(takeaway.table, null);
  await api('PATCH', '/orders/' + order.id + '/status', { status: 'completed' });
  assert.ok((await api('GET', '/orders')).some(row => row.id === order.id && row.status === 'completed'));
  await api('POST', '/supplies', { supplyNumber: 'BAD', supplier: 'A', items: [{ productId: product.id, quantity: 0, totalPrice: 10, expiresAt }] }, 400);
  const inventory = clients.find(([name]) => name === 'stoq-inventory-service')[1];
  await inventory.batch.update({ where: { id: warehouse[0].id }, data: { expiresAt: new Date('2000-01-01') } });
  const freshDish = await api('GET', '/dishes/' + dish.id);
  assert.equal(freshDish.recipeItems[0].stock, warehouse[1].Quantity);
  assert.equal(freshDish.recipeItems[0].price, warehouse[1].price);
  await inventory.batchBalance.update({ where: { batchId: warehouse[1].id }, data: { availableQuantity: 0.5 } });
  const lowGraph = await api('GET', '/analytics/graph');
  assert.equal(lowGraph.nodes.find(node => node.id === 'product:' + product.id).data.status, 'low_stock');
  assert.ok(lowGraph.edges.every(edge => edge.data.status === 'low_stock'));
  await inventory.batchBalance.update({ where: { batchId: warehouse[1].id }, data: { availableQuantity: 0 } });
  const emptyGraph = await api('GET', '/analytics/graph');
  assert.equal(emptyGraph.nodes.find(node => node.id === 'product:' + product.id).data.status, 'out_of_stock');
  assert.ok(emptyGraph.edges.every(edge => edge.data.status === 'unavailable'));
  assert.equal(new Set(emptyGraph.nodes.map(node => node.id)).size, emptyGraph.nodes.length);
  assert.ok(emptyGraph.edges.every(edge => emptyGraph.nodes.some(node => node.id === edge.source)
    && emptyGraph.nodes.some(node => node.id === edge.target)));
  console.log('HTTP → real RabbitMQ → real PostgreSQL passed: supply/inventory/dishes/orders, immutable order prices, fractional totals, adding positions, legacy null prices, ISO dates and completion.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const app of apps.reverse()) await app.close();
  for (const [, client] of clients) await client.$disconnect();
});
