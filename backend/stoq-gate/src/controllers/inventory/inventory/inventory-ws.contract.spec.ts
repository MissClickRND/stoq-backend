import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';
import { CommandBusService } from '../../../common/rabbitMQ/command-bus.service';
import { InventoryWsGateway } from './inventory.ws.gateway';
import { InventoryEventsListener } from './inventory-events.listener';
import { RecommendationEventsListener } from '../../recommendation/recommendation/recommendation-events.listener';
import { InventoryController } from './inventory.controller';

// Exercise the real Socket.IO server through its Engine.IO polling transport.
// No running broker, database, or socket.io-client installation is needed.
describe('inventory Socket.IO delivery', () => {
  let app: any;
  let base: string;
  let listener: InventoryEventsListener;
  const sendCommand = jest.fn();
  const sessions: string[] = [];

  async function request(url: string, body?: string) {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'text/plain;charset=UTF-8' },
      body, signal: AbortSignal.timeout(5000),
    });
    expect(response.ok).toBe(true);
    return response.text();
  }

  async function connect() {
    const endpoint = `${base}/socket.io/?EIO=4&transport=polling`;
    const handshake = await request(endpoint);
    const sid = JSON.parse(handshake.slice(1)).sid;
    const url = `${endpoint}&sid=${sid}`;
    sessions.push(url);
    await request(url, '40/inventory,');
    expect(await request(url)).toMatch(/^40\/inventory,/);
    return {
      send: (event: string, payload?: unknown) => request(url, `42/inventory,${JSON.stringify([event, payload])}`),
      receive: async () => (await request(url)).split('\x1e').filter((packet) => packet.startsWith('42/inventory,'))
        .map((packet) => JSON.parse(packet.slice('42/inventory,'.length))),
    };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [InventoryWsGateway, InventoryEventsListener,
        { provide: CommandBusService, useValue: { sendCommand } }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    listener = app.get(InventoryEventsListener);
  });
  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((url) => request(url, '1')));
    sendCommand.mockReset();
  });
  afterAll(async () => { await app?.close(); });

  it('delivers the GET /inventory body and readable notifications to every client', async () => {
    const first = await connect();
    const second = await connect();
    const product = { id: 7, name: 'Молоко', unit: { id: 1, name: 'Литр', shortName: 'л' } };
    const data = [{ id: 9, supplyId: 3, productId: 7, product, Quantity: 2.5, availableQuantity: 2.5,
      price: 100, totalPrice: 250, expiresAt: '2030-01-01T00:00:00Z', status: 'RUNNINGOUT' }];
    sendCommand.mockImplementation(async (_exchange, key) => ({ success: true,
      data: key === 'command.inventory.get_inventory' ? data : [product] }));
    const httpInventory = JSON.parse(await request(`${base}/inventory`));
    const stock = { eventId: 'stock-1', reason: 'SUPPLY_CREATED', supplyId: 3, occurredAt: '2026-10-15T00:00:00Z' };
    await listener.onStockChanged(stock);
    const stockEvent = { ...stock, data: httpInventory, problem: 'Добавлена поставка', message: 'Молоко: Добавлена поставка.',
      notifications: [{ productId: 7, productName: 'Молоко', problem: 'Добавлена поставка',
        message: 'Молоко: Добавлена поставка.', severity: 'info' }] };
    expect(await first.receive()).toEqual([['inventory:stockChanged', stockEvent]]);
    expect(await second.receive()).toEqual([['inventory:stockChanged', stockEvent]]);
    expect(sendCommand).toHaveBeenCalledWith('app.commands', 'command.inventory.get_inventory', { search: undefined });
    const expired = { eventId: 'expiry-1', batchId: 9, productId: 7, lostQuantity: '2.5',
      expiredAt: '2026-10-14T00:00:00Z', occurredAt: '2026-10-15T00:00:00Z' };
    await listener.onBatchExpired(expired);
    const expiredEvent = { ...expired, product, productName: 'Молоко', problem: 'Истёк срок годности', severity: 'warning',
      message: 'Молоко: истёк срок годности партии №9. Списано 2.5 л.' };
    expect(await first.receive()).toEqual([['inventory:batchExpired', expiredEvent]]);
    expect(await second.receive()).toEqual([['inventory:batchExpired', expiredEvent]]);
  });

  it('includes the name of a depleted product even when the warehouse becomes empty', async () => {
    const socket = await connect();
    sendCommand.mockImplementation(async (_exchange, key) => ({ success: true,
      data: key === 'command.inventory.get_inventory' ? [] : [{ id: 7, name: 'Молоко' }] }));
    await listener.onStockChanged({ eventId: 'depleted', reason: 'MANUAL_WRITE_OFF', productIds: [7], batchIds: [9] });
    const [[event, payload]] = await socket.receive();
    expect(event).toBe('inventory:stockChanged');
    expect(payload.data).toEqual([]);
    expect(payload.notifications).toEqual([{ productId: 7, productName: 'Молоко', problem: 'Остаток списан вручную',
      message: 'Молоко: Остаток списан вручную.', severity: 'info' }]);
    expect(sendCommand).toHaveBeenCalledWith('app.commands', 'command.catalog.get_product', { ids: [7] });
  });

  it('sends an empty snapshot after reset with a general notification', async () => {
    const socket = await connect();
    sendCommand.mockResolvedValue({ success: true, data: [] });
    await listener.onStockChanged({ reason: 'BUSINESS_RESET' });
    const [[, payload]] = await socket.receive();
    expect(payload.data).toEqual([]);
    expect(payload.notifications).toEqual([{ productId: null, productName: null, problem: 'Данные склада сброшены',
      message: 'Данные склада сброшены.', severity: 'info' }]);
  });

  it.each([{ success: false, error: { message: 'Inventory unavailable' } }, { success: true, data: null }])(
    'does not emit a false empty snapshot on RPC failure, and recovers for the next event', async (response) => {
      const socket = await connect();
      const gateway = app.get(InventoryWsGateway);
      const emit = jest.spyOn(gateway.server, 'emit');
      try {
        sendCommand.mockResolvedValueOnce(response).mockResolvedValue({ success: true, data: [] });
        await expect(listener.onStockChanged({ reason: 'MANUAL_UPDATE' })).rejects.toThrow();
        expect(emit).not.toHaveBeenCalled();
        await listener.onStockChanged({ reason: 'BUSINESS_RESET' });
        expect((await socket.receive())[0][1].data).toEqual([]);
      } finally { emit.mockRestore(); }
    },
  );

  it('still sends the expiration details when the catalog is unavailable', async () => {
    const socket = await connect();
    sendCommand.mockRejectedValue(new Error('Catalog unavailable'));
    await listener.onBatchExpired({ batchId: 9, productId: 7, lostQuantity: '2.5', expiredAt: '2026-10-14T00:00:00Z' });
    const [[, payload]] = await socket.receive();
    expect(payload).toMatchObject({ productId: 7, product: null, productName: 'Продукт #7',
      problem: 'Истёк срок годности', message: 'Продукт #7: истёк срок годности партии №9. Списано 2.5.' });
  });

  it('preserves snapshot order when multiple changes arrive during a slow RPC', async () => {
    const socket = await connect();
    let resolveFirst!: (response: any) => void;
    const slowResponse = new Promise((resolve) => { resolveFirst = resolve; });
    sendCommand.mockReturnValueOnce(slowResponse).mockResolvedValue({ success: true, data: [{ id: 2 }] });
    const first = listener.onStockChanged({ eventId: 'first', reason: 'MANUAL_UPDATE' });
    const second = listener.onStockChanged({ eventId: 'second', reason: 'MANUAL_UPDATE' });
    await Promise.resolve();
    expect(sendCommand).toHaveBeenCalledTimes(1);
    resolveFirst({ success: true, data: [{ id: 1 }] });
    await Promise.all([first, second]);
    const events = await socket.receive();
    expect(events.map(([, event]) => ({ eventId: event.eventId, data: event.data }))).toEqual([
      { eventId: 'first', data: [{ id: 1 }] }, { eventId: 'second', data: [{ id: 2 }] },
    ]);
  });

  it('returns stock with the caller requestId', async () => {
    const socket = await connect();
    sendCommand.mockResolvedValue({ success: true, data: [{ productId: 7, availableQuantity: 2 }] });
    await socket.send('inventory:getStock', { requestId: 'req-1', productIds: [7] });
    expect(await socket.receive()).toEqual([['inventory:stockResult', {
      requestId: 'req-1', data: [{ productId: 7, availableQuantity: 2 }],
    }]]);
    expect(sendCommand).toHaveBeenCalledWith('app.commands', 'command.inventory.get_stock', { productIds: [7] });
  });

  it('supports an omitted expiring-soon body and defaults to seven days', async () => {
    const socket = await connect();
    sendCommand.mockResolvedValue({ success: true, data: [] });
    await socket.send('inventory:getExpiringSoon');
    expect(await socket.receive()).toEqual([['inventory:expiringSoonResult', { requestId: expect.any(String), data: [] }]]);
    expect(sendCommand).toHaveBeenCalledWith('app.commands', 'command.inventory.get_expiring_inventory', { daysThreshold: 7 });
  });

  it.each([null, [], 'bad', {}, { productIds: [-1] }, { productIds: ['7'] }, { productIds: [7], unexpected: true }])(
    'returns inventory:error for invalid stock payload %j without calling RPC', async (payload) => {
      const socket = await connect();
      await socket.send('inventory:getStock', payload);
      expect(await socket.receive()).toEqual([['inventory:error', { requestId: expect.any(String), message: expect.any(String) }]]);
      expect(sendCommand).not.toHaveBeenCalled();
    },
  );

  it('preserves correlation when inventory RPC fails', async () => {
    const socket = await connect();
    sendCommand.mockResolvedValue({ success: false, error: { message: 'Inventory unavailable' } });
    await socket.send('inventory:getStock', { requestId: 'failed-request', productIds: [7] });
    expect(await socket.receive()).toEqual([['inventory:error', { requestId: 'failed-request', message: 'Inventory unavailable' }]]);
  });
});

describe('gateway RabbitMQ subscriptions', () => {
  it('uses separate broker-generated queues for each handler and each gateway instance', () => {
    const handlers = [InventoryEventsListener.prototype.onStockChanged,
      InventoryEventsListener.prototype.onBatchExpired, RecommendationEventsListener.prototype.onStopListUpdated];
    const options = handlers.map((handler) => Reflect.getMetadata(RABBIT_HANDLER, handler));
    expect(options.map((option) => option.routingKey)).toEqual([
      'inventory.stock.changed', 'inventory.batch_expired', 'recommendation.stop_list.updated',
    ]);
    for (const option of options) {
      expect(option.queue).toBe('');
      expect(option.queueOptions).toEqual({ exclusive: true, autoDelete: true, durable: false });
    }
  });
});
