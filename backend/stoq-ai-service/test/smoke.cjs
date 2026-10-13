const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { once } = require('node:events');

async function main() {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: require('node:path').resolve(__dirname, '..'),
    windowsHide: true,
    env: { ...process.env, OPENROUTER_API_KEY: 'smoke-test-no-real-api-calls', AI_PROXY_URL: '', SERVICE_API_KEY: '', HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test', RABBITMQ_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Service exited during startup: ${logs}`);
      try {
        const health = await fetch(`${base}/ai/health`, { signal: AbortSignal.timeout(1000) });
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok' });
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(ready, `Service did not start: ${logs}`);
    const docs = await fetch(`${base}/docs`, { signal: AbortSignal.timeout(5000) });
    assert.equal(docs.status, 200);
    assert.ok((await docs.text()).includes('swagger-ui'));
    const schema = await fetch(`${base}/docs-json`, { signal: AbortSignal.timeout(5000) });
    assert.equal(schema.status, 200);
    assert.ok((await schema.json()).paths['/ai']);
    const noFile = await fetch(`${base}/ai`, { method: 'POST', signal: AbortSignal.timeout(5000) });
    assert.equal(noFile.status, 400);
    assert.equal((await noFile.json()).code, 'FILE_REQUIRED');
    console.log('Production smoke passed: process startup, health, Swagger, OpenAPI, file-required error. No OpenRouter calls.');
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
