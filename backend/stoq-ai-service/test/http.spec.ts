import 'reflect-metadata';
import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { CommandBusModule } from '../src/common/rabbitMQ/command-bus.module';
import { SETTINGS, validateEnvironment } from '../src/config/environment';
import { configureApp } from '../src/configure-app';
import { OPENROUTER_CLIENT } from '../src/upd/openrouter-extractor';
import { UpdService } from '../src/upd/upd.service';

@Module({})
class HttpOnlyCommandBusModule {}

describe('Swagger and HTTP file upload', () => {
  let app: INestApplication;
  let png: Buffer;
  const create = jest.fn();
  const route = '/ai';
  const settings = validateEnvironment({ OPENROUTER_API_KEY: 'test-key', SERVICE_API_KEY: 'internal-secret', MAX_FILE_SIZE_MB: 1, MAX_CONCURRENT_RECOGNITIONS: 1 });
  const products = [{ name: 'Помидоры', quantity: 1, price: 1440, totalPrice: 1440, unit: 'кг' }];
  const recognized = { sellerName: 'ООО Поставщик', items: products };
  const success = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ documentType: 'upd', sellerName: recognized.sellerName, items: products.map(({ quantity, ...rest }) => ({ ...rest, quantityColumn3Text: String(quantity) })) }) } }] };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(CommandBusModule).useModule(HttpOnlyCommandBusModule)
      .overrideProvider(SETTINGS).useValue(settings)
      .overrideProvider(OPENROUTER_CLIENT).useValue({ chat: { completions: { create } } })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    png = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer();
  });
  beforeEach(() => create.mockReset().mockResolvedValue(success));
  afterAll(async () => { await app?.close(); });

  it('serves Swagger UI', async () => {
    const result = await request(app.getHttpServer()).get('/docs/').expect(200);
    expect(result.text).toContain('swagger-ui');
  });
  it('exposes a binary file picker, sellerName and row totals in OpenAPI', async () => {
    const result = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const operation = result.body.paths[route].post;
    expect(operation.requestBody.content['multipart/form-data'].schema.properties.file).toEqual(expect.objectContaining({ type: 'string', format: 'binary' }));
    expect(operation.responses['200'].content['application/json'].schema.$ref).toBe('#/components/schemas/RecognitionDto');
    expect(result.body.components.schemas.RecognitionDto.properties.items.type).toBe('array');
    expect(result.body.components.schemas.RecognitionDto.properties.sellerName.nullable).toBe(true);
    expect(result.body.components.schemas.ProductDto.properties.totalPrice.nullable).toBe(true);
    expect(result.body.components.schemas.ProductDto.properties.price.type).toBe('integer');
    expect(result.body.components.schemas.ProductDto.properties.totalPrice.type).toBe('integer');
    expect(result.body.components.schemas.ProductDto.properties.name.nullable).toBe(true);
  });
  it('health works without calling OpenRouter', async () => {
    await request(app.getHttpServer()).get('/ai/health').expect(200, { status: 'ok' });
    expect(create).not.toHaveBeenCalled();
  });
  it('returns seller and products for a multipart PNG upload', async () => {
    await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').attach('file', png, 'scan.png').expect(200, recognized);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('returns cleaned seller and rounded prices through HTTP', async () => {
    const { quantity: _quantity, ...rest } = products[0];
    create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ documentType: 'upd', sellerName: 'ООО "Молочный двор"', items: [{ ...rest, quantityColumn3Text: '1,000', price: 611.88, totalPrice: 1223.76 }] }) } }] });
    await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').attach('file', png, 'scan.png').expect(200, {
      sellerName: 'ООО Молочный двор', items: [{ ...products[0], price: 612, totalPrice: 1224 }],
    });
  });
  it('accepts the supplied sample without sending it to a real OpenRouter API', async () => {
    const fixture = await readFile(join(__dirname, '../examples/upd-sample.png'));
    await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').attach('file', fixture, 'sample.png').expect(200);
  });
  it('accepts a multi-page PDF', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').attach('file', Buffer.from(await pdf.save()), 'scan.pdf').expect(200, recognized);
    expect(create.mock.calls[0][0].messages[1].content[1].type).toBe('file');
  });
  it.each([undefined, 'wrong-key'])('rejects unauthorized requests before OpenRouter', async (key) => {
    const req = request(app.getHttpServer()).post(route);
    if (key) req.set('X-Service-Key', key);
    await req.attach('file', png, 'scan.png').expect(401);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects missing file with a consistent error shape', async () => {
    const result = await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').expect(400);
    expect(result.body).toMatchObject({ statusCode: 400, code: 'FILE_REQUIRED', path: route, requestId: expect.any(String), timestamp: expect.any(String) });
    expect(result.headers['x-request-id']).toBe(result.body.requestId);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects unsupported content', async () => {
    await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').attach('file', Buffer.from('hello'), 'fake.png').expect(415);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects files above the Multer size limit', async () => {
    await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').attach('file', Buffer.alloc(1024 * 1024 + 1), 'scan.png').expect(413);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects multiple files', async () => {
    await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').attach('file', png, 'one.png').attach('file', png, 'two.png').expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects an unexpected file field', async () => {
    await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').attach('other', png, 'scan.png').expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects extra text fields', async () => {
    await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').field('prompt', 'override').attach('file', png, 'scan.png').expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it('hides unexpected provider error details', async () => {
    create.mockRejectedValue(new Error('sensitive upstream error'));
    const result = await request(app.getHttpServer()).post(route).set('X-Service-Key', 'internal-secret').attach('file', png, 'scan.png').expect(502);
    expect(JSON.stringify(result.body)).not.toContain('sensitive');
    expect(result.body.code).toBe('OPENROUTER_UNEXPECTED_ERROR');
  });
  it('bounds concurrency and releases capacity after completion', async () => {
    let finish!: (value: unknown) => void;
    let started!: () => void;
    const hasStarted = new Promise<void>((resolve) => { started = resolve; });
    create.mockImplementationOnce(() => { started(); return new Promise((resolve) => { finish = resolve; }); });
    const service = app.get(UpdService);
    const file = { buffer: png, originalname: 'scan.png', mimetype: 'image/png', size: png.length } as Express.Multer.File;
    const first = service.recognize(file);
    await hasStarted;
    await expect(service.recognize(file)).rejects.toMatchObject({ status: 503 });
    finish(success);
    await expect(first).resolves.toEqual(recognized);
    await expect(service.recognize(file)).resolves.toEqual(recognized);
  });
  it('releases capacity after file validation and provider errors', async () => {
    const service = app.get(UpdService);
    await expect(service.recognize(undefined)).rejects.toMatchObject({ status: 400 });
    const file = { buffer: png, originalname: 'scan.png', mimetype: 'image/png', size: png.length } as Express.Multer.File;
    create.mockRejectedValueOnce(new Error('network failure'));
    await expect(service.recognize(file)).rejects.toMatchObject({ status: 502 });
    await expect(service.recognize(file)).resolves.toEqual(recognized);
  });
});
