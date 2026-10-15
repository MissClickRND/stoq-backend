import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { restaurantId } from '../common/tenant/restaurant-context';
import { PrismaService } from '../prisma/prisma.service';

export interface AvailabilitySnapshot<T> {
  result: T;
  dishes: Array<{ dishId: number; status: string;
    products: Array<{ productId: number; name: string; unit: any }> }>;
}

@Injectable()
export class ShortageTracker {
  constructor(private readonly prisma: PrismaService) {}

  async reconcile<T>(load: () => Promise<AvailabilitySnapshot<T>>): Promise<T> {
    const tenant = restaurantId();
    return this.prisma.$transaction(async tx => {
      // Load AFTER the tenant lock: a slower earlier RPC cannot overwrite a newer snapshot.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72391, ${tenant}::integer)`;
      const snapshot = await load();
      const now = new Date();
      await tx.shortageTracking.upsert({ where: { restaurantId: tenant },
        create: { restaurantId: tenant, startedAt: now }, update: {} });
      const previous = new Map((await tx.dishAvailability.findMany({ where: { restaurantId: tenant } }))
        .map(row => [row.dishId, row]));
      for (const dish of snapshot.dishes) {
        const before = previous.get(dish.dishId);
        const starts = before?.status === 'AVAILABLE' && dish.status !== 'AVAILABLE';
        const episode = (before?.episode ?? 0) + (starts ? 1 : 0);
        if (starts && dish.products.length) {
          await tx.shortageIncident.createMany({ skipDuplicates: true,
            data: dish.products.map(product => ({ restaurantId: tenant, dishId: dish.dishId,
              episode, productId: product.productId, productName: product.name,
              unit: product.unit ?? Prisma.DbNull, occurredAt: now })) });
        }
        await tx.dishAvailability.upsert({ where: { restaurantId_dishId: { restaurantId: tenant, dishId: dish.dishId } },
          create: { restaurantId: tenant, dishId: dish.dishId, status: dish.status, episode, observedAt: now },
          update: { status: dish.status, episode, observedAt: now } });
      }
      return snapshot.result;
    }, { timeout: 60000, maxWait: 65000 });
  }

  async statistics(days: number) {
    const tenant = restaurantId();
    const now = new Date();
    const day = new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
    const from = new Date(`${day}T00:00:00+03:00`);
    from.setUTCDate(from.getUTCDate() - days + 1);
    const [tracking, records] = await Promise.all([
      this.prisma.shortageTracking.findUnique({ where: { restaurantId: tenant } }),
      this.prisma.shortageIncident.findMany({ where: { restaurantId: tenant, occurredAt: { gte: from, lte: now } }, orderBy: { occurredAt: 'asc' } }),
    ]);
    const products = new Map<number, any>();
    for (const record of records) {
      const item = products.get(record.productId) ?? { productId: record.productId, name: record.productName,
        unit: record.unit, incidents: 0, dishes: new Set<number>(), lastOccurredAt: '' };
      item.incidents++; item.dishes.add(record.dishId);
      item.name = record.productName; item.unit = record.unit;
      item.lastOccurredAt = record.occurredAt.toISOString();
      products.set(record.productId, item);
    }
    return { trackingStartedAt: tracking?.startedAt.toISOString() ?? null,
      items: [...products.values()].map(({ dishes, ...item }) => ({ ...item, affectedDishes: dishes.size }))
        .sort((a, b) => b.incidents - a.incidents || a.name.localeCompare(b.name, 'ru') || a.productId - b.productId) };
  }
}
