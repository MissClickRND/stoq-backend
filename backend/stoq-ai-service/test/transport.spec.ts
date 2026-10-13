import { validateEnvironment } from '../src/config/environment';
import { OpenRouterTransport } from '../src/upd/openrouter-transport';
import { OpenRouterExtractor } from '../src/upd/openrouter-extractor';
import { createServer, Server } from 'node:http';
import { connect, Socket } from 'node:net';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  return address.port;
}

describe('AI transport configuration', () => {
  it('uses the OpenRouter endpoint and never falls back to an OpenAI key', async () => {
    expect(() => validateEnvironment({ OPENAI_API_KEY: 'legacy-key' })).toThrow('OPENROUTER_API_KEY');
    const transport = new OpenRouterTransport(validateEnvironment({ OPENROUTER_API_KEY: 'router-key' }));
    try {
      expect(transport.client.baseURL).toBe('https://openrouter.ai/api/v1');
      expect(transport.client.apiKey).toBe('router-key');
    } finally { await transport.onModuleDestroy(); }
  });
  it('accepts an authenticated HTTPS proxy without exposing credentials', () => {
    const settings = validateEnvironment({ OPENROUTER_API_KEY: 'test-key', AI_PROXY_URL: 'https://user:private-password@proxy.example.com:8443' });
    expect(settings).toMatchObject({ AI_PROXY_URL: 'https://user:private-password@proxy.example.com:8443' });
  });
  it.each(['socks5://proxy.example.com:1080', 'ftp://proxy.example.com', 'https://proxy.example.com/path', 'not-a-url'])('rejects unsupported proxy configuration %s', (url) => {
    expect(() => validateEnvironment({ OPENROUTER_API_KEY: 'test-key', AI_PROXY_URL: url })).toThrow('AI_PROXY_URL');
  });
  it('does not expose proxy credentials in validation errors', () => {
    try { validateEnvironment({ OPENROUTER_API_KEY: 'test-key', AI_PROXY_URL: 'https://user:private-password@proxy.example.com/path' }); }
    catch (error) {
      expect(String(error)).toContain('AI_PROXY_URL');
      expect(String(error)).not.toContain('private-password');
      return;
    }
    throw new Error('Expected rejection');
  });
});

describe('Proxy isolation', () => {
  it('serializes the OpenRouter PDF plugin and strict schema through the real SDK', async () => {
    let payload: Record<string, any> = {};
    const server = createServer(async (req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toBe('/v1/chat/completions');
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      payload = JSON.parse(Buffer.concat(parts).toString('utf8'));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ documentType: 'upd', sellerName: null, items: [{ name: 'Помидоры', quantityColumn3Text: '1,000', price: 1440, totalPrice: 1440, unit: 'кг' }] }) } }] }));
    });
    const port = await listen(server);
    const settings = validateEnvironment({ OPENROUTER_API_KEY: 'router-test-key' });
    const transport = new OpenRouterTransport(settings);
    transport.client.baseURL = `http://127.0.0.1:${port}/v1`;
    try {
      const extractor = new OpenRouterExtractor(settings, transport.client);
      expect(await extractor.extract({ buffer: Buffer.from('PDF test bytes'), mimeType: 'application/pdf', filename: 'document.pdf' })).toMatchObject({ sellerName: null, items: [expect.objectContaining({ totalPrice: 1440 })] });
      expect(payload.model).toBe('openai/gpt-4.1-mini');
      expect(payload.provider).toEqual({ require_parameters: true });
      expect(payload.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }]);
      expect(payload.response_format.json_schema.strict).toBe(true);
      expect(payload.messages[1].content[1].file.file_data).toMatch(/^data:application\/pdf;base64,/);
    } finally {
      await transport.onModuleDestroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('tunnels only SDK calls and leaves ordinary backend requests direct', async () => {
    const sockets = new Set<Socket>();
    const origins: string[] = [];
    const authorizations: (string | undefined)[] = [];
    const origin = createServer((req, res) => {
      origins.push(req.url ?? '');
      expect(req.headers['proxy-authorization']).toBeUndefined();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(req.url === '/health' ? { status: 'ok' } : { id: 'gpt-4.1', object: 'model', owned_by: 'test', created: 0 }));
    });
    const proxy = createServer();
    proxy.on('connect', (req, downstream, head) => {
      authorizations.push(req.headers['proxy-authorization']);
      const upstream = connect(originPort, '127.0.0.1', () => {
        downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        downstream.pipe(upstream);
        upstream.pipe(downstream);
      });
      sockets.add(upstream);
      sockets.add(downstream as Socket);
      upstream.on('error', () => downstream.destroy());
      downstream.on('error', () => upstream.destroy());
      downstream.on('close', () => upstream.destroy());
    });
    const originPort = await listen(origin);
    const proxyPort = await listen(proxy);
    const settings = validateEnvironment({ OPENROUTER_API_KEY: 'test-key', AI_PROXY_URL: `http://user:private-password@127.0.0.1:${proxyPort}` });
    const transport = new OpenRouterTransport(settings);
    // Use a local fake API so the test makes no external requests.
    transport.client.baseURL = `http://127.0.0.1:${originPort}/v1`;
    try {
      expect(await transport.client.models.retrieve('gpt-4.1')).toMatchObject({ id: 'gpt-4.1' });
      expect(authorizations).toEqual([`Basic ${Buffer.from('user:private-password').toString('base64')}`]);
      const direct = await globalThis.fetch(`http://127.0.0.1:${originPort}/health`);
      expect(await direct.json()).toEqual({ status: 'ok' });
      expect(authorizations).toHaveLength(1);
      expect(origins).toEqual(['/v1/models/gpt-4.1', '/health']);
    } finally {
      await transport.onModuleDestroy();
      for (const socket of sockets) socket.destroy();
      origin.closeAllConnections();
      proxy.closeAllConnections();
      await Promise.all([new Promise<void>((resolve) => origin.close(() => resolve())), new Promise<void>((resolve) => proxy.close(() => resolve()))]);
    }
  });
  it('keeps SDK calls direct when AI_PROXY_URL is empty', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'gpt-4.1', object: 'model', owned_by: 'test', created: 0 }));
    });
    const port = await listen(server);
    const transport = new OpenRouterTransport(validateEnvironment({ OPENROUTER_API_KEY: 'test-key' }));
    transport.client.baseURL = `http://127.0.0.1:${port}/v1`;
    try { expect(await transport.client.models.retrieve('gpt-4.1')).toMatchObject({ id: 'gpt-4.1' }); }
    finally {
      await transport.onModuleDestroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
