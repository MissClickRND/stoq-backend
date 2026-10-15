// Additive, idempotent upgrade of existing local databases; never deletes business rows.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const { Pool } = require(path.join(root,'backend/stoq-auth-service/node_modules/pg'));
const { parse } = require(path.join(root,'backend/stoq-auth-service/node_modules/dotenv'));
const arg = process.argv.indexOf('--restaurant-id');
const restaurantId = Number(process.argv[arg + 1]);
if (arg < 0 || !Number.isSafeInteger(restaurantId) || restaurantId < 1) throw new Error('Usage: node scripts/assign-legacy-restaurant.cjs --restaurant-id ID');
const configs = [
 ['stoq-catalog-service','catalog_db',['"Unit"','"Product"','"Dish"']],
 ['stoq-inventory-service','inventory_db',['supply.supplies','inventory.batches','inventory.stock_movements','inventory.idempotency_keys']],
 ['stoq-order-service','orders_db',['"Order"']],
 ['stoq-recommendation-service','recommendations_db',['"StopListItem"']],
];
const env = service => parse(fs.readFileSync(path.join(root,'backend',service,'.env')));
async function main() {
 const auth = new Pool({connectionString:env('stoq-auth-service').DATABASE_URL});
 try { const result=await auth.query('SELECT id FROM "Restaurant" WHERE id = $1',[restaurantId]);if(!result.rowCount) throw new Error('Restaurant does not exist'); } finally {await auth.end();}
 const connections=[];
 try {
  for(const [service,expected,tables] of configs) {
   const connectionString=env(service).DATABASE_URL;
   if(decodeURIComponent(new URL(connectionString).pathname.slice(1))!==expected) throw new Error(`${service}: unexpected database; check DATABASE_URL`);
   const pool=new Pool({connectionString}); const client=await pool.connect(); connections.push({pool,client});
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(73120420)');
   await client.query(fs.readFileSync(path.join(root,'backend',service,'prisma/migrations/20261015160000_restaurant_isolation/migration.sql'),'utf8'));
   for(const table of tables) {
    const before=(await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count;
    const keyUpdate=table==='inventory.idempotency_keys' ? ', key = ($1::integer)::text || \':\' || key' : '';
    const result=await client.query(`UPDATE ${table} SET "restaurantId" = $1::integer${keyUpdate} WHERE "restaurantId" IS NULL`,[restaurantId]);
    const after=(await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count;
    if(after!==before) throw new Error(`${service}: row count changed unexpectedly`);
    console.log(JSON.stringify({service,table,restaurantId,assigned:result.rowCount,total:after}));
   }
  }
  for(const {client} of connections) await client.query('COMMIT');
 } catch(error) {for(const {client} of connections) await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally {for(const {pool,client} of connections){client.release();await pool.end();}}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
