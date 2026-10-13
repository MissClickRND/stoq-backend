jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
import { OrdersService } from './orders.service';
describe('Order metadata contract', () => {
  it('POST saves ISO date, type, table and guests; both GETs return them', async () => {
    let stored: any;
    const prisma: any = { order: {
      create: jest.fn().mockImplementation(({ data }) => (stored = { id: 1, ...data, items: [] })),
      findMany: jest.fn().mockImplementation(() => [stored]), findUnique: jest.fn().mockImplementation(() => stored) } };
    const service = new OrdersService(prisma, { sendCommand: jest.fn() } as any);
    const date = '2026-10-13T12:30:00.000Z';
    const result: any = await service.create({ date, type: 'dine-in', table: 3, guests: 4 } as any);
    expect(result).toMatchObject({ date, type: 'dine-in', table: 3, guests: 4 });
    expect((await service.findAll())[0]).toMatchObject({ date, type: 'dine-in', table: 3, guests: 4 });
    expect(await service.findOne(1)).toMatchObject({ date, type: 'dine-in', table: 3, guests: 4 });
  });
  it('takeaway clears table; invalid metadata is rejected before writing', async () => {
    const prisma: any = { order: { create: jest.fn().mockImplementation(({ data }) => data) } };
    const service = new OrdersService(prisma, { sendCommand: jest.fn() } as any);
    expect((await service.create({ type: 'takeaway', table: 9, guests: 1 } as any) as any).table).toBeNull();
    for (const dto of [{ date: 'bad' }, { type: 'delivery' }, { type: 'dine-in', table: 0 }, { guests: 0 }])
      await expect(service.create(dto as any)).rejects.toThrow();
  });
});
