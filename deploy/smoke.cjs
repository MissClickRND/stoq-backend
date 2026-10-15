// Runs against the public HTTPS endpoint; removes only its own temporary account.
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const authRequire = createRequire(path.join(root, 'backend/stoq-auth-service/package.json'));
const { Client } = authRequire('pg');
const base = process.env.SMOKE_API_URL || 'https://lyaguh.site/api';
const email = `deployment-${randomUUID()}@example.invalid`;
const password = randomBytes(24).toString('hex');
const restaurantName = `Deployment check ${randomUUID()}`;
let restaurantId;
async function request(route, options = {}) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(20000), ...options });
  const text = await response.text();
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}: ${text.slice(0, 400)}`);
  return { response, body: text ? JSON.parse(text) : null };
}
async function main() {
  const cleanup = new Client({ connectionString: process.env.DATABASE_URL });
  await cleanup.connect();
  try {
    await request('/auth/register-restaurant', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fullName:'Deployment check',email,password,restaurantName,restaurantAddress:'Temporary deployment verification'}) });
    const login=await request('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    restaurantId=login.body.user.restaurantId;
    const cookies=login.response.headers.getSetCookie();
    if(cookies.length<2 || !cookies.every(cookie=>/; secure/i.test(cookie) && /; httponly/i.test(cookie)))throw new Error('Secure HttpOnly session cookies missing');
    const headers={Cookie:cookies.map(cookie=>cookie.split(';')[0]).join('; ')};
    for(const route of ['/auth/status','/product/units','/product','/dishes','/supplies','/inventory','/orders','/recommendations','/statistics/orders/today','/analytics/graph','/ai/health']) {
      await request(route,{headers});console.log(`PASS ${route}`);
    }
    const socket=await fetch(base.replace(/\/api$/, '')+'/socket.io/?EIO=4&transport=polling',{headers,signal:AbortSignal.timeout(10000)});
    if(!socket.ok || !(await socket.text()).startsWith('0{'))throw new Error('Socket.IO handshake failed');
    console.log('PASS secure cookies and Socket.IO handshake');
    if(process.env.SMOKE_RECOGNIZE === 'true') {
      const file=require('node:fs').readFileSync(path.join(root,'backend/stoq-ai-service/examples/upd-sample.png'));
      const form=new FormData();form.append('file',new Blob([file],{type:'image/png'}),'upd-sample.png');
      const recognition=await request('/ai',{method:'POST',headers,body:form,signal:AbortSignal.timeout(170000)});
      if(!Array.isArray(recognition.body?.items) || !recognition.body.items.length)throw new Error('AI returned no recognized rows');
      console.log(`PASS real UPD recognition through HTTPS, RabbitMQ and local worker (${recognition.body.items.length} rows)`);
    }
  } finally {
    await cleanup.query('BEGIN');
    try {
      const user=await cleanup.query('DELETE FROM "User" WHERE email=$1 RETURNING "restaurantId"',[email]);
      const ownRestaurant=restaurantId ?? user.rows[0]?.restaurantId;
      if(ownRestaurant)await cleanup.query('DELETE FROM "Restaurant" WHERE id=$1 AND name=$2',[ownRestaurant,restaurantName]);
      await cleanup.query('COMMIT');
    } catch(error) {await cleanup.query('ROLLBACK');throw error;}
    finally{await cleanup.end();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
