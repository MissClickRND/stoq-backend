jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
import { OrdersService } from './orders.service';

describe('Immutable order creator', () => {
  let service: any;
  let prisma: any;
  beforeEach(() => {
    prisma = { order: { create: jest.fn(async ({ data }) => ({ ...data, id: 1, items: [] })) } };
    service = new OrdersService(prisma, {} as any, { publishOrderCreated: jest.fn() } as any);
  });
  it('saves a verified employee snapshot separately from client DTO', async () => {
    const result = await service.create({}, { id: 6, name: 'Иван Петров', role: 'WAITER', source: 'EMPLOYEE' });
    expect(prisma.order.create.mock.calls[0][0].data).toMatchObject({ createdById: 6, createdByName: 'Иван Петров', createdByRole: 'WAITER', createdBySource: 'EMPLOYEE' });
    expect(result.createdBy).toEqual({ id: 6, name: 'Иван Петров', role: 'WAITER', source: 'EMPLOYEE' });
  });
  it('identifies guests and keeps old unknown creators unknown', async () => {
    expect((await service.create({}, { id: null, name: 'Гость', role: null, source: 'GUEST' })).createdBy).toMatchObject({ name: 'Гость', source: 'GUEST' });
    expect((await service.create({})).createdBy).toBeNull();
  });
});
