const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const load = createRequire(path.resolve(__dirname, '../backend/stoq-inventory-service/package.json'));
const { PrismaService } = load('./dist/prisma/prisma.service.js');
const { InventoryService } = load('./dist/inventory/inventory.service.js');
const { restaurantStorage } = load('./dist/common/tenant/restaurant-context.js');
async function main() {
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/ci_/, 'Only isolated CI database');
  const prisma = new PrismaService();
  const tenants = [230001, 230002];
  const service = new InventoryService(prisma, { sendCommand: async () => ({ success: true, data: [{ id: 1, name: 'Product', unit: { shortName: 'kg' } }] }) });
  const run = fn => restaurantStorage.run(tenants[0], fn);
  try {
    const batches = [];
    for (const restaurantId of tenants) {
      const supply = await prisma.supply.create({ data: { restaurantId, supplyNumber: 'disposal-ci', supplier: 'CI', status: 'RECEIVED' } });
      batches.push(await prisma.batch.create({ data: { restaurantId, supplyId: supply.id, productId: 1, initialQuantity: 2,
        expiresAt: new Date(Date.now()-86400000), status: 'EXPIRED', balance: { create: { availableQuantity: 0, reservedQuantity: 0 } } } }));
    }
    await prisma.stockMovement.create({ data: { restaurantId: tenants[0], batchId: batches[0].id, productId: 1, orderId: 'SYSTEM_EXPIRATION', type: 'WRITE_OFF', quantity: -2 } });
    assert.equal((await run(() => service.getWriteOffs())).length, 1);
    await assert.rejects(run(() => service.disposeBatch(batches[1].id)));
    assert.equal((await run(() => service.disposeBatch(batches[0].id))).alreadyDisposed, false);
    assert.equal((await run(() => service.disposeBatch(batches[0].id))).alreadyDisposed, true);
    assert.equal((await run(() => service.getWriteOffs())).length, 0);
    assert.equal((await run(() => service.getStatistics())).spoiledProducts, 0);
    const history = await run(() => service.getMovementHistory());
    assert.equal(history.items.length, 1); assert.equal(history.items[0].quantity, -2);
    console.log('PASS real PostgreSQL disposal is isolated and idempotent, removes pending spoiled count and preserves stock movement history');
  } finally {
    await prisma.stockMovement.deleteMany({ where: { restaurantId: { in: tenants } } });
    await prisma.batchBalance.deleteMany({ where: { batch: { restaurantId: { in: tenants } } } });
    await prisma.batch.deleteMany({ where: { restaurantId: { in: tenants } } });
    await prisma.supply.deleteMany({ where: { restaurantId: { in: tenants } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
