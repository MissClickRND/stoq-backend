const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const load = createRequire(path.resolve(__dirname, '../backend/stoq-auth-service/package.json'));
const { PrismaService } = load('./dist/prisma/prisma.service.js');
const { AuditService } = load('./dist/auth/audit.service.js');
async function main() {
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/ci_/, 'Use a dedicated CI database');
  const prisma = new PrismaService();
  const audit = new AuditService(prisma);
  const tenants = [220001, 220002];
  const actor = { id: 1, fullName: 'Test administrator', role: 'ADMIN' };
  const event = n => ({ id: `audit-test-${String(n).padStart(3, '0')}`, action: 'create', category: 'Tests',
    title: 'Test activity', description: 'Isolated CI activity', timestamp: '2026-10-15T12:00:00.123Z' });
  try {
    await prisma.$connect();
    for (let n = 0; n < 65; n++) await audit.append(tenants[0], actor, event(n));
    await audit.append(tenants[1], actor, event(99));
    await Promise.all(Array.from({ length: 6 }, () => audit.append(tenants[0], actor, event(64))));
    const first = await audit.list(tenants[0]);
    assert.equal(first.items.length, 30);
    // Newer inserts cannot cause duplicate or skipped older rows with keyset pagination.
    await audit.append(tenants[0], actor, { ...event(70), timestamp: '2026-10-15T12:00:01.000Z' });
    const second = await audit.list(tenants[0], first.nextCursor);
    const third = await audit.list(tenants[0], second.nextCursor);
    assert.equal(second.items.length, 30); assert.equal(third.items.length, 5); assert.equal(third.nextCursor, null);
    assert.equal(new Set([...first.items, ...second.items, ...third.items].map(e => e.id)).size, 65);
    assert.equal((await audit.list(tenants[1])).items.length, 1);
    assert.equal((await new AuditService(prisma).list(tenants[0])).items[0].id, event(70).id);
    await audit.append(tenants[0], actor, { ...event(101), stockMovementId: 5 });
    await audit.append(tenants[0], actor, { ...event(102), stockMovementId: 5 });
    assert.equal(await prisma.activityLog.count({ where: { restaurantId: tenants[0], stockMovementId: 5 } }), 1);
    assert.equal((await audit.stockCursor(tenants[0])).stockCursor, 0, 'HTTP audit insert must not skip earlier unsynced movements');
    await Promise.all([20, 50, 30].map(id => audit.stockCursor(tenants[0], id)));
    assert.equal((await new AuditService(prisma).stockCursor(tenants[0])).stockCursor, 50);
    console.log('PASS PostgreSQL activity persistence, same-time order, 30-row pages, concurrent deduplication and tenant isolation');
  } finally {
    await prisma.activityLog.deleteMany({ where: { restaurantId: { in: tenants } } });
    await prisma.activitySyncState.deleteMany({ where: { restaurantId: { in: tenants } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
