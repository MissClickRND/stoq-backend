import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthIoAdapter } from './auth-io.adapter';
import { CommandBusService } from '../common/rabbitMQ/command-bus.service';
import { ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';
import { InventoryWsGateway } from '../controllers/inventory/inventory/inventory.ws.gateway';
import { RecommendationsWsGateway } from '../controllers/recommendation/recommendation/recommendation.ws.gateway';

describe('Socket.IO authentication', () => {
  let app: any;
  let base: string;
  let revoked: boolean;
  const sessions: string[] = [];
  const sendCommand = jest.fn();

  async function packet(url: string, body?: string) {
    const response = await new Promise<{ status?: number; body: string }>((resolve, reject) => {
      const req = httpRequest(url, {
        method: body === undefined ? 'GET' : 'POST', agent: false,
        headers: body === undefined ? undefined : { 'Content-Type': 'text/plain;charset=UTF-8' },
      }, (res) => {
        let result = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { result += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: result }));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => req.destroy(new Error('Socket.IO request timeout')));
      req.end(body);
    });
    expect(response.status).toBe(200);
    return response.body;
  }

  async function connect(namespace: string, token?: string) {
    const endpoint = `${base}/socket.io/?EIO=4&transport=polling`;
    const sid = JSON.parse((await packet(endpoint)).slice(1)).sid;
    const url = `${endpoint}&sid=${sid}`;
    sessions.push(url);
    await packet(
      url,
      `40${namespace},${JSON.stringify(token ? { accessToken: token } : {})}`,
    );
    return { reply: await packet(url), url };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        InventoryWsGateway,
        RecommendationsWsGateway,
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: CommandBusService, useValue: { sendCommand } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useWebSocketAdapter(new AuthIoAdapter(app, app.get(AuthService)));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    for (const url of sessions) await packet(url, '1').catch(() => {});
    // Refused namespace handshakes can leave Engine.IO clients waiting for connectTimeout.
    const namespace = app.get(InventoryWsGateway).server as any;
    namespace.server.engine.close();
    await app.close();
  });
  beforeEach(() => {
    revoked = false;
    sendCommand
      .mockReset()
      .mockImplementation(async (_exchange, key, payload) => {
        if (key === ROUTING_KEYS.AUTH_VERIFY_ACCESS) {
          return revoked
            ? { success: false, error: { status: 401 } }
            : {
                success: true,
                data: {
                  id: 1,
                  restaurantId: 7,
                  role: payload.accessToken,
                  fullName: 'User',
                  email: 'user@example.com',
                },
              };
        }
        return { success: true, data: [] };
      });
  });

  it.each(['/inventory', '/recommendations'])(
    'refuses anonymous connections to %s',
    async (namespace) => {
      expect((await connect(namespace)).reply).toMatch(/^44/);
    },
  );

  it('refuses storekeeper access to recommendations', async () => {
    expect((await connect('/recommendations', 'STOREKEEPER')).reply).toMatch(/^44/);
  });

  it.each(['ADMIN', 'MANAGER', 'WAITER', 'STOREKEEPER'])(
    'accepts %s before subscribing to broadcasts',
    async (role) => {
      expect((await connect('/inventory', role)).reply).toMatch(
        /^40\/inventory,/,
      );
    },
  );

  it('rechecks the session before processing messages and disconnects a revoked client', async () => {
    const { reply, url } = await connect('/inventory', 'WAITER');
    expect(reply).toMatch(/^40/);
    revoked = true;
    sendCommand.mockClear();
    await packet(url, '42/inventory,["inventory:getStock",{"productIds":[1]}]');
    expect(await packet(url)).toContain('41/inventory,');
    expect(
      sendCommand.mock.calls.every(
        (call) => call[1] === ROUTING_KEYS.AUTH_VERIFY_ACCESS,
      ),
    ).toBe(true);
  });
});
