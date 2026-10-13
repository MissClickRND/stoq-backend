const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const workerDir = path.join(root, 'backend/stoq-ai-service');
const gateDir = path.join(root, 'backend/stoq-gate');

// A separate broker and fake OpenRouter transport: no billing or real credentials.
process.env.NODE_ENV = 'test';
process.env.RABBITMQ_ENABLED = 'true';
process.env.RABBITMQ_URL = process.env.AI_TEST_RABBITMQ_URL ?? 'amqp://admin:admin@127.0.0.1:5677';
process.env.OPENROUTER_API_KEY = 'integration-test-key';
process.env.AI_PROXY_URL = '';
process.env.SERVICE_API_KEY = 'standalone-only-test-key';
process.env.AI_RPC_TIMEOUT_MS = '10000';
process.env.AI_MAX_FILE_SIZE_MB = '1';

const WorkerTest = require(path.join(workerDir, 'node_modules/@nestjs/testing')).Test;
const GateTest = require(path.join(gateDir, 'node_modules/@nestjs/testing')).Test;
const { EcosystemModule } = require(path.join(workerDir, 'dist/ecosystem.module'));
const { OPENROUTER_CLIENT } = require(path.join(workerDir, 'dist/upd/openrouter-extractor'));
const { configureApp } = require(path.join(workerDir, 'dist/configure-app'));
const { AppModule: GateModule } = require(path.join(gateDir, 'dist/app.module'));
const { SwaggerModule, DocumentBuilder } = require(path.join(gateDir, 'node_modules/@nestjs/swagger'));
const { PDFDocument } = require(path.join(workerDir, 'node_modules/pdf-lib'));
const expected = { sellerName: 'ООО Молочный двор', items: [{ name: 'Молоко', quantity: 2, price: 612, totalPrice: 1224, unit: 'шт' }] };

async function main() {
  let worker;
  let gateway;
  let calls = 0;
  const requests = [];
  const create = async (params) => {
    calls++; requests.push(params);
    // Proves that the new RPC path works beyond the old 5-second timeout.
    if (calls === 1) await new Promise(resolve => setTimeout(resolve, 5500));
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ documentType: 'upd', sellerName: 'ООО "Молочный двор"',
      items: [{ name: 'Молоко', quantityColumn3Text: '2,000', price: 611.88, totalPrice: 1223.76, unit: 'шт' }] }) } }] };
  };
  try {
    const workerModule = await WorkerTest.createTestingModule({ imports: [EcosystemModule] })
      .overrideProvider(OPENROUTER_CLIENT).useValue({ chat: { completions: { create } } }).compile();
    worker = workerModule.createNestApplication({ logger: false }); configureApp(worker);
    await worker.listen(0, '127.0.0.1');
    const gateModule = await GateTest.createTestingModule({ imports: [GateModule] }).compile();
    gateway = gateModule.createNestApplication({ logger: false });
    SwaggerModule.setup('api', gateway, SwaggerModule.createDocument(gateway, new DocumentBuilder().setTitle('STOQ integration').build()));
    await gateway.listen(0, '127.0.0.1');
    const base = await gateway.getUrl();
    const health = await fetch(`${base}/ai/health`, { signal: AbortSignal.timeout(10000) });
    assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ok' });
    const form = new FormData();
    const image = fs.readFileSync(path.join(workerDir, 'examples/upd-sample.png'));
    form.append('file', new Blob([image], { type: 'image/png' }), 'sample.png');
    const start = Date.now();
    const response = await fetch(`${base}/ai`, { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); assert.deepEqual(body, expected);
    assert.ok(Date.now() - start >= 5000); assert.equal(calls, 1);
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    const pdfForm = new FormData(); pdfForm.append('file', new Blob([await pdf.save()], { type: 'application/pdf' }), 'sample.pdf');
    const pdfResponse = await fetch(`${base}/ai`, { method: 'POST', body: pdfForm, signal: AbortSignal.timeout(10000) });
    assert.equal(pdfResponse.status, 200); assert.deepEqual(await pdfResponse.json(), expected);
    assert.equal(requests[1].messages[1].content[1].type, 'file');
    const badForm = new FormData(); badForm.append('file', new Blob(['not image'], { type: 'image/png' }), 'fake.png');
    const invalid = await fetch(`${base}/ai`, { method: 'POST', body: badForm, signal: AbortSignal.timeout(10000) });
    assert.equal(invalid.status, 415); assert.equal((await invalid.json()).code, 'UNSUPPORTED_FILE_TYPE'); assert.equal(calls, 2);
    const docs = await fetch(`${base}/api-json`); assert.ok((await docs.json()).paths['/ai'].post.requestBody.content['multipart/form-data']);
    console.log('Integration passed: HTTP /ai → real RabbitMQ → ai-service → mocked OpenRouter → JSON. PNG, PDF, health, safe errors and >5s processing verified. No paid inference.');
  } finally { if (gateway) await gateway.close(); if (worker) await worker.close(); }
}
main().catch(error => { console.error(String(error.message).replace(/amqps?:\/\/[^@\s]+@/g, 'amqp://***@')); process.exitCode = 1; });
