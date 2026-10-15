// Use the same CommandBusService and RPC contract as the application.
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const gateRequire = createRequire(path.join(root, 'backend/stoq-gate/package.json'));
const recommendationRequire = createRequire(path.join(root, 'backend/stoq-recommendation-service/package.json'));
const Redis = recommendationRequire('ioredis');
const { AmqpConnection } = gateRequire('@golevelup/nestjs-rabbitmq');
const { CommandBusService } = require(path.join(root, 'backend/stoq-gate/dist/common/rabbitMQ/command-bus.service.js'));
const { EXCHANGES, ROUTING_KEYS } = require(path.join(root, 'backend/stoq-gate/dist/common/rabbitMQ/rabbitmq-topology.js'));
const { restaurantStorage } = require(path.join(root, 'backend/stoq-gate/dist/common/tenant/restaurant-context.js'));
async function main() {
  const connection = new AmqpConnection({ uri: process.env.RABBITMQ_URL, connectionInitOptions: { wait: true, timeout: 10000 }, logger: { log() {}, warn() {}, error() {}, debug() {}, verbose() {} } });
  try {
    await connection.init();
    const bus = new CommandBusService(connection);
    const auth = await bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.AUTH_LOGIN, { dto: { email: 'deployment-health@example.invalid', password: 'invalid-deployment-health' } });
    if (!auth || auth.success !== false) throw new Error('Auth RPC did not return the expected rejected login');
    for (const key of [ROUTING_KEYS.GET_UNIT, ROUTING_KEYS.GET_DISHES, ROUTING_KEYS.GET_SUPPLY, ROUTING_KEYS.GET_INVENTORY, ROUTING_KEYS.GET_ORDER, ROUTING_KEYS.GET_DEPENDENCY_GRAPH]) {
      const result = await restaurantStorage.run(1, () => bus.sendCommand(EXCHANGES.COMMANDS, key, {}));
      if (!result?.success) throw new Error(`Business RPC failed: ${key}`);
    }
    const redis = new Redis({ host:process.env.REDIS_HOST || '127.0.0.1', port:Number(process.env.REDIS_PORT || 6379), lazyConnect:true, connectTimeout:5000, maxRetriesPerRequest:1, retryStrategy:()=>null });
    try { await redis.connect(); if(await redis.ping() !== 'PONG')throw new Error('Redis health failed'); }
    finally { redis.disconnect(); }
    if (process.env.CHECK_AI === 'true') {
      const ai = await restaurantStorage.run(1, () => bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.AI_HEALTH, {}, { timeoutMs: 10000 }));
      if (!ai?.success) throw new Error('AI RPC failed');
    }
    console.log('RabbitMQ auth/business RPC and Redis health passed');
  } finally { await connection.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
