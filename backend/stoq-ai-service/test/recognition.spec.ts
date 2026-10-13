import OpenAI from 'openai';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { DocumentValidator } from '../src/upd/document-validator';
import { OpenRouterExtractor } from '../src/upd/openrouter-extractor';
import { validateEnvironment } from '../src/config/environment';

const settings = validateEnvironment({ OPENROUTER_API_KEY: 'test-key', MAX_PDF_PAGES: '2' });
const item = { name: 'Помидоры', quantity: 1, price: 1440, totalPrice: 1440, unit: 'кг' };
const sellerName = 'ООО Поставщик';
const recognized = { sellerName, items: [item] };
const completed = (value: Record<string, unknown>) => {
  const items = Array.isArray(value.items) ? value.items.map(({ quantity, ...rest }) => ({
    ...rest, quantityColumn3Text: quantity === null ? null : String(quantity),
  })) : value.items;
  return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ sellerName, ...value, items }) } }] };
};
const document = { buffer: Buffer.from('image'), mimeType: 'image/png' as const, filename: 'document.png' };

describe('OpenRouter recognition boundary', () => {
  let create: jest.Mock;
  let extractor: OpenRouterExtractor;
  beforeEach(() => {
    create = jest.fn().mockResolvedValue(completed({ documentType: 'upd', items: [item] }));
    extractor = new OpenRouterExtractor(settings, { chat: { completions: { create } } } as unknown as OpenAI);
  });
  it('returns seller and items and sends a strict Zod schema and a high-detail image', async () => {
    expect(await extractor.extract(document)).toEqual(recognized);
    const input = create.mock.calls[0][0];
    expect(input.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    expect(input.provider.require_parameters).toBe(true);
    expect(input.messages[1].content[1]).toMatchObject({ type: 'image_url', image_url: { detail: 'high', url: 'data:image/png;base64,aW1hZ2U=' } });
  });
  it('sends the whole PDF inline without uploading a persistent file', async () => {
    await extractor.extract({ ...document, mimeType: 'application/pdf', filename: 'document.pdf' });
    expect(create.mock.calls[0][0].messages[1].content[1]).toMatchObject({ type: 'file', file: { filename: 'document.pdf', file_data: 'data:application/pdf;base64,aW1hZ2U=' } });
    expect(create.mock.calls[0][0].plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }]);
  });
  it('preserves unreadable fields as null and zero as zero', async () => {
    create.mockResolvedValue(completed({ documentType: 'upd', sellerName: null, items: [{ name: null, quantity: 0, price: null, totalPrice: null, unit: null }] }));
    expect(await extractor.extract(document)).toEqual({ sellerName: null, items: [{ name: null, quantity: 0, price: null, totalPrice: null, unit: null }] });
  });
  it('preserves column 9 independently of unit price and quantity without recalculation', async () => {
    const product = { ...item, quantity: 2, price: 10, totalPrice: 99.99 };
    create.mockResolvedValue(completed({ documentType: 'upd', sellerName: 'Продавец из строки (2)', items: [product] }));
    expect(await extractor.extract(document)).toEqual({ sellerName: 'Продавец из строки (2)', items: [{ ...product, totalPrice: 100 }] });
  });
  it.each([
    ['ООО "Молочный двор"', 'ООО Молочный двор'],
    ['ООО «Молочный двор»', 'ООО Молочный двор'],
    ['  ООО „Молочный   двор“  ', 'ООО Молочный двор'],
    ['ООО \\"Молочный двор\\"', 'ООО Молочный двор'],
    ["ООО О'Кей", "ООО О'Кей"],
  ])('normalizes seller name %s to %s', async (raw, expected) => {
    create.mockResolvedValue(completed({ documentType: 'upd', sellerName: raw, items: [item] }));
    expect(await extractor.extract(document)).toEqual({ sellerName: expected, items: [item] });
  });
  it('rounds both prices to whole rubles and preserves fractional quantities', async () => {
    const product = { ...item, quantity: 1.125, price: 611.88, totalPrice: 1223.76 };
    create.mockResolvedValue(completed({ documentType: 'upd', items: [product] }));
    expect(await extractor.extract(document)).toEqual({ sellerName, items: [{ ...product, price: 612, totalPrice: 1224 }] });
  });
  it('rounds each price independently and rounds half a ruble upwards', async () => {
    const product = { ...item, quantity: 2, price: 611.5, totalPrice: 1222.99 };
    create.mockResolvedValue(completed({ documentType: 'upd', items: [product] }));
    expect(await extractor.extract(document)).toEqual({ sellerName, items: [{ ...product, price: 612, totalPrice: 1223 }] });
  });
  it('does not discard a valid quantity because it resembles a code', async () => {
    const product = { ...item, quantity: 123 };
    create.mockResolvedValue(completed({ documentType: 'upd', items: [product] }));
    expect(await extractor.extract(document)).toEqual({ sellerName, items: [product] });
  });
  it.each([['1,000', 1], ['123,000', 123], ['2,500', 2.5], ['1 234,500', 1234.5], ['0,000', 0]])('parses literal column 3 text %s as %s', async (text, expected) => {
    const { quantity: _quantity, ...rest } = item;
    create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ documentType: 'upd', sellerName, items: [{ ...rest, quantityColumn3Text: text }] }) } }] });
    expect(await extractor.extract(document)).toEqual({ sellerName, items: [{ ...item, quantity: expected }] });
    const schema = create.mock.calls[0][0].response_format.json_schema.schema.properties.items.items.properties;
    expect(schema.quantity).toBeUndefined();
    expect(schema.quantityColumn3Text).toBeDefined();
  });
  it('keeps a missing quantity cell null without using a code from elsewhere', async () => {
    create.mockResolvedValue(completed({ documentType: 'upd', items: [{ ...item, quantity: null }] }));
    expect(await extractor.extract(document)).toEqual({ sellerName, items: [{ ...item, quantity: null }] });
  });
  it('rejects text combining a code and a quantity instead of joining them into a number', async () => {
    const { quantity: _quantity, ...rest } = item;
    create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ documentType: 'upd', sellerName, items: [{ ...rest, quantityColumn3Text: '796 2,000' }] }) } }] });
    await expect(extractor.extract(document)).rejects.toMatchObject({ response: { code: 'INVALID_MODEL_RESPONSE' } });
  });
  it('keeps unreadable totalPrice null without multiplying price by quantity', async () => {
    const product = { ...item, totalPrice: null };
    create.mockResolvedValue(completed({ documentType: 'upd', items: [product] }));
    expect(await extractor.extract(document)).toEqual({ sellerName, items: [product] });
  });
  it.each([
    { sellerName: ' ', items: [item] },
    { sellerName, items: [{ ...item, totalPrice: -1 }] },
    { sellerName, items: [{ ...item, totalPrice: '1 440,00' }] },
  ])('rejects invalid seller or row total: %j', async (value) => {
    create.mockResolvedValue(completed({ documentType: 'upd', ...value }));
    await expect(extractor.extract(document)).rejects.toMatchObject({ status: 502 });
  });
  it.each([
    { documentType: 'other', items: [] },
    { documentType: 'unreadable', items: [] },
    { documentType: 'upd', items: [] },
  ])('rejects documents with no recognized products: %j', async (value) => {
    create.mockResolvedValue(completed(value));
    await expect(extractor.extract(document)).rejects.toMatchObject({ status: 422 });
  });
  it.each([
    { choices: [{ finish_reason: 'length', message: { content: '{}' } }] },
    { choices: [] },
    completed({ documentType: 'upd', items: [{ ...item, price: '1440,00' }] }),
    completed({ documentType: 'upd', items: [{ ...item, quantity: -1 }] }),
    completed({ documentType: 'upd', items: [{ ...item, extra: 'unwanted' }] }),
    completed({ documentType: 'upd', items: [{ name: null, quantity: null, price: null, totalPrice: null, unit: null }] }),
    { choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] },
  ])('rejects incomplete or invalid output without returning partial rows: %j', async (value) => {
    create.mockResolvedValue(value);
    await expect(extractor.extract(document)).rejects.toMatchObject({ status: 502 });
  });
  it('handles model refusal', async () => {
    create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }] });
    await expect(extractor.extract(document)).rejects.toMatchObject({ status: 422 });
  });
  it.each([[401, 503], [402, 503], [403, 503], [400, 502], [429, 503], [500, 502]])('maps provider %i to HTTP %i', async (upstream, status) => {
    create.mockRejectedValue(new OpenAI.APIError(upstream, { message: 'secret provider detail' }, 'secret provider detail', new Headers()));
    await expect(extractor.extract(document)).rejects.toMatchObject({ status });
  });
  it('maps timeout to 504', async () => {
    create.mockRejectedValue(new OpenAI.APIConnectionTimeoutError());
    await expect(extractor.extract(document)).rejects.toMatchObject({ status: 504 });
  });
  it('maps connection errors to 503', async () => {
    create.mockRejectedValue(new OpenAI.APIConnectionError({ message: 'network detail' }));
    await expect(extractor.extract(document)).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    [401, 'invalid_api_key', undefined, 'OPENROUTER_AUTHENTICATION_ERROR'],
    [402, undefined, undefined, 'OPENROUTER_BILLING_ERROR'],
    [403, undefined, undefined, 'OPENROUTER_ACCESS_DENIED'],
    [403, 'unsupported_country_region_territory', undefined, 'OPENROUTER_REGION_UNSUPPORTED'],
    [404, 'model_not_found', undefined, 'OPENROUTER_MODEL_UNAVAILABLE'],
    [429, 'credit_balance_exhausted', 'insufficient_quota', 'OPENROUTER_BILLING_ERROR'],
    [429, 'insufficient_quota', 'insufficient_quota', 'OPENROUTER_BILLING_ERROR'],
    [429, undefined, 'insufficient_quota', 'OPENROUTER_BILLING_ERROR'],
    [429, 'organization_spend_limit_exceeded', undefined, 'OPENROUTER_BILLING_ERROR'],
    [429, 'project_spend_limit_exceeded', undefined, 'OPENROUTER_BILLING_ERROR'],
    [429, 'organization_usage_limit_exceeded', undefined, 'OPENROUTER_BILLING_ERROR'],
    [429, 'rate_limit_exceeded', 'rate_limit_error', 'OPENROUTER_RATE_LIMIT'],
  ])('distinguishes provider failure %i / %s without exposing secrets', async (status, code, type, expected) => {
    create.mockRejectedValue(new OpenAI.APIError(status as number, { code, type, message: 'secret key sk-private-value' }, 'secret key sk-private-value', new Headers()));
    await expect(extractor.extract(document)).rejects.toMatchObject({ response: { code: expected } });
    try { await extractor.extract(document); }
    catch (error) { expect(JSON.stringify(error)).not.toContain('sk-private-value'); }
  });
});

describe('OpenRouter PDF engines and gateway responses', () => {
  it.each(['mistral-ocr', 'cloudflare-ai'] as const)('uses explicitly selected %s engine', async (engine) => {
    const create = jest.fn().mockResolvedValue(completed({ documentType: 'upd', items: [item] }));
    const extractor = new OpenRouterExtractor({ ...settings, OPENROUTER_PDF_ENGINE: engine }, { chat: { completions: { create } } } as unknown as OpenAI);
    await extractor.extract({ ...document, mimeType: 'application/pdf', filename: 'document.pdf' });
    expect(create.mock.calls[0][0].plugins).toEqual([{ id: 'file-parser', pdf: { engine } }]);
  });
  it('maps an error envelope returned inside HTTP 200 to a billing error', async () => {
    const create = jest.fn().mockResolvedValue({ error: { code: 402 } });
    const extractor = new OpenRouterExtractor(settings, { chat: { completions: { create } } } as unknown as OpenAI);
    await expect(extractor.extract(document)).rejects.toMatchObject({ response: { code: 'OPENROUTER_BILLING_ERROR' } });
  });
  it('does not add a PDF parser for an image', async () => {
    const create = jest.fn().mockResolvedValue(completed({ documentType: 'upd', items: [item] }));
    const extractor = new OpenRouterExtractor(settings, { chat: { completions: { create } } } as unknown as OpenAI);
    await extractor.extract(document);
    expect(create.mock.calls[0][0].plugins).toBeUndefined();
  });
});

describe('File validation', () => {
  const validator = new DocumentValidator(settings);
  const upload = (buffer: Buffer, originalname: string, mimetype: string) => ({ buffer, originalname, mimetype, size: buffer.length } as Express.Multer.File);
  it('accepts and decodes a real PNG', async () => {
    const buffer = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer();
    expect(await validator.validate(upload(buffer, 'scan.png', 'image/png'))).toMatchObject({ mimeType: 'image/png', filename: 'document.png' });
  });
  it.each(['jpeg', 'webp'] as const)('accepts a real %s', async (format) => {
    const buffer = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).toFormat(format).toBuffer();
    expect(await validator.validate(upload(buffer, `scan.${format}`, `image/${format}`))).toMatchObject({ mimeType: `image/${format}` });
  });
  it('rejects missing files', async () => {
    await expect(validator.validate(undefined)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects an empty file', async () => {
    await expect(validator.validate(upload(Buffer.alloc(0), 'scan.png', 'image/png'))).rejects.toMatchObject({ status: 400 });
  });
  it('rejects text renamed to PNG', async () => {
    await expect(validator.validate(upload(Buffer.from('not an image'), 'scan.png', 'image/png'))).rejects.toMatchObject({ status: 415 });
  });
  it('rejects a damaged PNG even with the correct signature', async () => {
    const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await expect(validator.validate(upload(buffer, 'scan.png', 'image/png'))).rejects.toMatchObject({ status: 400 });
  });
  it('rejects excessive decoded pixel dimensions', async () => {
    const limited = new DocumentValidator({ ...settings, MAX_IMAGE_PIXELS: 100 });
    const buffer = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer();
    await expect(limited.validate(upload(buffer, 'scan.png', 'image/png'))).rejects.toMatchObject({ status: 413 });
  });
  it('rejects a forged MIME type and extension', async () => {
    const buffer = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer();
    await expect(validator.validate(upload(buffer, 'scan.pdf', 'application/pdf'))).rejects.toMatchObject({ status: 415 });
  });
  it('rejects a damaged PDF with a valid signature', async () => {
    await expect(validator.validate(upload(Buffer.from('%PDF-1.7\nbroken'), 'scan.pdf', 'application/pdf'))).rejects.toMatchObject({ status: 400 });
  });
  it('accepts a valid multi-page PDF and a generic binary MIME type', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    const buffer = Buffer.from(await pdf.save());
    expect(await validator.validate(upload(buffer, 'scan.PDF', 'application/octet-stream'))).toMatchObject({ mimeType: 'application/pdf' });
  });
  it('rejects too many PDF pages', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage(); pdf.addPage();
    await expect(validator.validate(upload(Buffer.from(await pdf.save()), 'scan.pdf', 'application/pdf'))).rejects.toMatchObject({ status: 413 });
  });
  it('rejects oversized input before decoding', async () => {
    const limited = new DocumentValidator({ ...settings, MAX_FILE_SIZE_MB: 1 });
    await expect(limited.validate(upload(Buffer.alloc(1024 * 1024 + 1), 'scan.png', 'image/png'))).rejects.toMatchObject({ status: 413 });
  });
});

describe('Environment validation', () => {
  it('requires a real key and does not echo secrets in errors', () => {
    expect(() => validateEnvironment({})).toThrow();
    expect(() => validateEnvironment({ OPENROUTER_API_KEY: 'replace-with-your-openai-api-key' })).toThrow();
    expect(() => validateEnvironment({ OPENROUTER_API_KEY: 'test-key', PORT: 'invalid' })).toThrow('PORT');
  });
  it('rejects unsafe or malformed limits', () => {
    for (const overrides of [{ MAX_FILE_SIZE_MB: 51 }, { MAX_CONCURRENT_RECOGNITIONS: 0 }, { OPENROUTER_TIMEOUT_MS: 'NaN' }]) {
      expect(() => validateEnvironment({ OPENROUTER_API_KEY: 'test-key', ...overrides })).toThrow();
    }
  });
});
