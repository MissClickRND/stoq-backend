// Runs only against an explicitly supplied isolated test database, after migrations.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const service = path.resolve(__dirname, '../backend/stoq-recommendation-service');
const load = createRequire(path.join(service, 'package.json'));
const { PrismaService } = load('./dist/prisma/prisma.service.js');
const { ShortageTracker } = load('./dist/recommendations/shortage-tracker.js');
const { restaurantStorage } = load('./dist/common/tenant/restaurant-context.js');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  assert.match(url.pathname, /^\/(ci_|stoq_contracts)/, 'Use a dedicated test database');
  const prisma = new PrismaService();
  const tracker = new ShortageTracker(prisma);
  const tenants = [210001, 210002];
  const observe = (tenant, status) => restaurantStorage.run(tenant, () => tracker.reconcile(async () => ({
    result: status, dishes: [{ dishId: 7, status, products: status === 'AVAILABLE' ? [] : [
      { productId: 8, name: 'Test product', unit: { id: 1, name: 'Kilogram', shortName: 'kg' } },
    ] }],
  })));
  try {
    await prisma.$connect();
    await observe(tenants[0], 'AVAILABLE');
    await observe(tenants[1], 'STOP_LIST');
    await Promise.all(Array.from({ length: 8 }, () => observe(tenants[0], 'LOW_STOCK')));
    await observe(tenants[0], 'STOP_LIST');
    assert.equal(await prisma.shortageIncident.count({ where: { restaurantId: tenants[0] } }), 1);
    assert.equal(await prisma.shortageIncident.count({ where: { restaurantId: tenants[1] } }), 0);
    await observe(tenants[0], 'AVAILABLE');
    await observe(tenants[0], 'STOP_LIST');
    const result = await restaurantStorage.run(tenants[0], () => tracker.statistics(7));
    assert.equal(result.items[0].incidents, 2);
    assert.equal(result.items[0].affectedDishes, 1);
    assert.ok(result.trackingStartedAt);
    const restarted = new ShortageTracker(prisma);
    assert.deepEqual(await restaurantStorage.run(tenants[0], () => restarted.statistics(7)), result);
    await restaurantStorage.run(tenants[0], () => tracker.reconcile(async () => { throw new Error('RPC failure'); })).then(
      () => { throw new Error('Expected upstream failure'); }, error => assert.match(error.message, /RPC failure/));
    assert.equal(await prisma.shortageIncident.count({ where: { restaurantId: tenants[0] } }), 2);
    console.log('PASS real PostgreSQL shortage baseline, advisory lock/concurrency, episodes, isolation and persistence');
  } finally {
    await prisma.shortageIncident.deleteMany({ where: { restaurantId: { in: tenants } } });
    await prisma.dishAvailability.deleteMany({ where: { restaurantId: { in: tenants } } });
    await prisma.shortageTracking.deleteMany({ where: { restaurantId: { in: tenants } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
