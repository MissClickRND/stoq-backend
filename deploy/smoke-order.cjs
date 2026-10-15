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
async function api(route, body) {
  const response = await fetch(base + route, { method:body ? 'POST' : 'GET', headers:{'Content-Type':'application/json', ...(cookie ? { Cookie:cookie } : {})}, body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(20000) });
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
    console.log('PASS HTTPS order creation, idempotency key, stock movement and remaining balance');
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
        await clean('auth',['DELETE FROM "ActivityLog" WHERE "restaurantId"=$1','DELETE FROM "User" WHERE "restaurantId"=$1','DELETE FROM "Restaurant" WHERE id=$1']);
        console.log('PASS temporary order verification data removed');
      }
    } finally { await Promise.all([...clients.values()].map(client=>client.end())); }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
