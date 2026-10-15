import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SupplyService } from './supplies.service';
import { restaurantStorage } from '../common/tenant/restaurant-context';
import { mapSupplyWithItemsToDto } from './dto/response/supply-response.dto';

function supply(id: number, status: string, prices: (number | null)[]) {
  return { id, supplyNumber: `S${id}`, status, receivedAt: new Date('2026-10-01T00:00:00+03:00'),
    items: prices.map((totalPrice, index) => ({ id: index, productId: index, quantity: new Prisma.Decimal(2), totalPrice: totalPrice == null ? null : new Prisma.Decimal(totalPrice) })) };
}
function setup(supplies: any[]) {
  const prisma: any = { supply: { findMany: jest.fn(async () => supplies), findUnique: jest.fn(async () => supplies[0] ?? null) } };
  return { service: new SupplyService(prisma, {} as any) as any, prisma };
}
describe('supply statistics', () => {
  afterEach(() => jest.useRealTimers());
  it('uses Moscow month boundaries and delivered positions, totals and denominator', async () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-30T21:30:00Z'));
    const { service, prisma } = setup([supply(1, 'RECEIVED', [100, 200]), supply(2, 'RECEIVED', [100]), supply(3, 'IN_TRANSIT', [999])]);
    expect(await restaurantStorage.run(7, () => service.getStatistics())).toEqual({ month: '2026-10', count: 3, products: 3, total: 400, average: 200 });
    expect(prisma.supply.findMany.mock.calls[0][0].where).toEqual({ restaurantId: 7, status: { not: 'CANCELLED' }, receivedAt: { gte: new Date('2026-09-30T21:00:00Z'), lt: new Date('2026-10-31T21:00:00Z') } });
  });
  it('preserves unknown historical prices and returns real zero only for an empty delivered set', async () => {
    expect(await setup([supply(1, 'RECEIVED', [null])]).service.getStatistics()).toMatchObject({ total: null, average: null });
    expect(await setup([supply(1, 'IN_TRANSIT', [999])]).service.getStatistics()).toMatchObject({ total: 0, average: 0, products: 0 });
  });
  it('scopes details and rejects missing/foreign supplies', async () => {
    const { service, prisma } = setup([supply(9, 'RECEIVED', [300, 400])]);
    expect(await restaurantStorage.run(5, () => service.getStatistics(9))).toEqual({ id: 9, supplyNumber: 'S9', receivedAt: '2026-09-30T21:00:00.000Z', positions: 2, total: 700 });
    expect(prisma.supply.findUnique.mock.calls[0][0].where).toEqual({ restaurantId: 5, id: 9 });
    await expect(setup([]).service.getStatistics(9)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('exposes server totals and position counts in existing supply list and detail DTOs', () => {
    const known = supply(1, 'RECEIVED', [100, 200]);
    known.items.forEach((item: any) => { item.expiresAt = new Date('2027-01-01'); });
    expect(mapSupplyWithItemsToDto(known, new Map())).toMatchObject({ total: 300, positions: 2 });
    const unknown = supply(2, 'RECEIVED', [100, null]);
    unknown.items.forEach((item: any) => { item.expiresAt = new Date('2027-01-01'); });
    expect(mapSupplyWithItemsToDto(unknown, new Map())).toMatchObject({ total: null, positions: 2 });
  });
});
