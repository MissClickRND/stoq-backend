// Verifies an actual order and stock deduction in an isolated temporary restaurant.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const authRequire = createRequire(path.resolve(__dirname, '../backend/stoq-auth-service/package.json'));
const { Client } = authRequire('pg');
const base = process.env.SMOKE_API_URL || 'https://lyaguh.site/api';
const email = `order-check-${randomUUID()}@example.invalid`;
const password = randomBytes(24).toString('hex');
const restaurantName = `Order verification ${randomUUID()}`;
const clients = new Map();
let tenant;
let cookie;
async function api(route, body, method) {
  const response = await fetch(base + route, { method:method || (body ? 'POST' : 'GET'), headers:{'Content-Type':'application/json', ...(cookie ? { Cookie:cookie } : {})}, body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(20000) });
  const data = await response.json();
  assert.ok(response.ok, `${route}: HTTP ${response.status}: ${JSON.stringify(data)}`);
  return { response, data };
}
async function database(service) {
  if (!clients.has(service)) {
    const env = parseEnv(fs.readFileSync(path.join(process.env.SMOKE_ENV_DIRECTORY || '/etc/stoq', `stoq-${service}-service.env`), 'utf8'));
    const client = new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
    await client.connect();clients.set(service,client);
  }
  return clients.get(service);
}
async function clean(service, statements) {
  const client = await database(service);
  await client.query('BEGIN');
  try { for(const sql of statements)await client.query(sql,[tenant]);await client.query('COMMIT'); }
  catch(error){await client.query('ROLLBACK');throw error;}
}
async function main() {
  try {
    await api('/auth/register-restaurant',{fullName:'Order check',email,password,restaurantName,restaurantAddress:'Temporary order verification'});
    const login = await api('/auth/login',{email,password});
    tenant = login.data.user.restaurantId;
    cookie = login.response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    const unit = (await api('/product/units',{name:'Order check unit',shortName:'check'})).data;
    const product = (await api('/product',{name:'Order check product',unitId:unit.id})).data;
    await api('/supplies',{supplyNumber:`check-${randomUUID()}`,supplier:'Order check supplier',items:[{productId:product.id,quantity:10,totalPrice:1000,expiresAt:new Date(Date.now()+7*86400000).toISOString()}]});
    const dish = (await api('/dishes',{name:'Order check dish',salePrice:150,recipeItems:[{productId:product.id,quantity:0.5}]})).data;
    const order = (await api('/orders',{type:'takeaway',guests:1,items:[{dishId:dish.id,quantity:2}]})).data;
    assert.equal(order.status,'created');assert.equal(order.totalPrice,300);
    const inventory = await database('inventory');
    const keys = await inventory.query('SELECT key FROM inventory.idempotency_keys WHERE "restaurantId"=$1 AND order_id=$2',[tenant,String(order.id)]);
    assert.equal(keys.rowCount,1);
    const movements = await inventory.query('SELECT sum(quantity) AS quantity FROM inventory.stock_movements WHERE "restaurantId"=$1 AND order_id=$2',[tenant,String(order.id)]);
    assert.equal(Number(movements.rows[0].quantity),-1);
    const balance = await inventory.query('SELECT sum(bb.available_quantity) AS available FROM inventory.batch_balances bb JOIN inventory.batches b ON b.id=bb.batch_id WHERE b."restaurantId"=$1 AND b.product_id=$2',[tenant,product.id]);
    assert.equal(Number(balance.rows[0].available),9);

    await api('/orders/'+order.id+'/status',{status:'completed'},'PATCH');
    const dash=(await api('/statistics/dashboard?days=14')).data;
    assert.equal(dash.summary.revenue,300);assert.equal(dash.summary.orders,1);assert.equal(dash.summary.completed,1);assert.equal(dash.summary.earning,200);
    const details=(await api('/statistics/dishes/'+dish.id+'?days=7')).data;
    assert.equal(details.today,2);assert.equal(details.week,2);assert.equal(details.popularity,1);
    const batch=(await api('/inventory')).data[0];
    const recommendation=await database('recommendation');
    let baseline;
    for(let attempt=0;attempt<30;attempt++) {
      await api('/statistics/dishes');
      baseline=await recommendation.query('SELECT status FROM "DishAvailability" WHERE "restaurantId"=$1 AND "dishId"=$2',[tenant,dish.id]);
      if(baseline.rows[0]?.status==='AVAILABLE')break;
      await new Promise(r=>setTimeout(r,1000));
    }
    assert.equal(baseline.rows[0]?.status,'AVAILABLE');
    const preview=(await api('/inventory/preview',{items:[{batchId:batch.id,quantity:1}]})).data;
    assert.deepEqual(preview,{checked:1,updated:1,deleted:0,unchanged:0});
    const report=(await api('/inventory',{items:[{batchId:batch.id,quantity:1}],includeReport:true},'PUT')).data;
    assert.deepEqual(report.statistics,preview);assert.ok(report.completedAt);
    let shortage;
    for(let attempt=0;attempt<20;attempt++) {
      shortage=(await api('/statistics/shortages?days=14')).data;
      if(shortage.items[0]?.incidents===1)break;
      await new Promise(r=>setTimeout(r,400));
    }
    assert.equal(shortage.items[0]?.productId,product.id);assert.equal(shortage.items[0]?.incidents,1);
    assert.equal((await api('/statistics/shortages?days=14')).data.items[0].incidents,1);
    const supplyStats=(await api('/statistics/supplies')).data;
    assert.equal(supplyStats.count,1);assert.equal(supplyStats.total,1000);assert.equal(supplyStats.average,1000);
    assert.equal((await api('/auth/admin/statistics')).data.admins,1);
    // Expire only our own batch, then let the existing scheduler write it off and publish events.
    await inventory.query(`UPDATE inventory.batches SET expires_at=now()-interval '1 minute' WHERE id=$1 AND "restaurantId"=$2`,[batch.id,tenant]);
    let writeoff;
    for(let attempt=0;attempt<90;attempt++) {
      writeoff=(await api('/inventory/write-offs')).data.find(b=>b.batchId===batch.id);
      if(writeoff?.writtenOffQuantity===1)break;
      await new Promise(r=>setTimeout(r,1000));
    }
    assert.equal(writeoff?.writtenOffQuantity,1);assert.ok(writeoff.writtenOffAt);
    assert.equal((await api('/inventory')).data.length,0);
    assert.equal((await api('/inventory/statistics')).data.spoiledProducts,1);
    assert.equal((await api('/statistics/shortages?days=14')).data.items[0].incidents,1);
    console.log('PASS HTTPS server dashboard/dish/warehouse/supply/admin statistics, inventory preview/report, persistent shortages and automatic expiration');

  } finally {
    try {
      const auth=await database('auth');
      const own=await auth.query('SELECT r.id FROM "Restaurant" r JOIN "User" u ON u."restaurantId"=r.id WHERE r.name=$1 AND u.email=$2',[restaurantName,email]);
      if(own.rowCount===1){
        tenant=own.rows[0].id;
        await clean('order',['DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId"=$1)','DELETE FROM "Order" WHERE "restaurantId"=$1']);
        await clean('inventory',['DELETE FROM inventory.stock_movements WHERE "restaurantId"=$1','DELETE FROM inventory.idempotency_keys WHERE "restaurantId"=$1','DELETE FROM inventory.batch_balances WHERE batch_id IN (SELECT id FROM inventory.batches WHERE "restaurantId"=$1)','DELETE FROM inventory.batches WHERE "restaurantId"=$1','DELETE FROM supply.supply_items WHERE supply_id IN (SELECT id FROM supply.supplies WHERE "restaurantId"=$1)','DELETE FROM supply.supplies WHERE "restaurantId"=$1']);
        await clean('recommendation',['DELETE FROM "ShortageIncident" WHERE "restaurantId"=$1','DELETE FROM "DishAvailability" WHERE "restaurantId"=$1','DELETE FROM "ShortageTracking" WHERE "restaurantId"=$1','DELETE FROM "StopListItem" WHERE "restaurantId"=$1']);
        await clean('catalog',['DELETE FROM "RecipeItem" WHERE "dishId" IN (SELECT id FROM "Dish" WHERE "restaurantId"=$1)','DELETE FROM "Dish" WHERE "restaurantId"=$1','DELETE FROM "Product" WHERE "restaurantId"=$1','DELETE FROM "Unit" WHERE "restaurantId"=$1']);
        await clean('auth',['DELETE FROM "User" WHERE "restaurantId"=$1','DELETE FROM "Restaurant" WHERE id=$1']);
        console.log('PASS temporary order verification data removed');
      }
    } finally { await Promise.all([...clients.values()].map(client=>client.end())); }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
