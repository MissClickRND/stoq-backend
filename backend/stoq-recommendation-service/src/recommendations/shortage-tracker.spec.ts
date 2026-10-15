jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ShortageTracker } from './shortage-tracker';

describe('Persistent shortage episodes', () => {
  let tracker: any;
  let tx: any;
  let states: Map<number, any>;
  let incidents: any[];
  let locked: boolean;
  const snapshot = (status: string, products = [5]) => ({ result: status,
    dishes: [{ dishId: 2, status, products: products.map(productId => ({ productId, name: `P${productId}`, unit: null })) }] });
  beforeEach(() => {
    states = new Map(); incidents = []; locked = false;
    tx = { $executeRaw: jest.fn(async () => { locked = true; }),
      shortageTracking: { upsert: jest.fn().mockResolvedValue({ startedAt: new Date() }) },
      dishAvailability: { findMany: jest.fn(async () => [...states.values()]),
        upsert: jest.fn(async ({ create, update }) => { states.set(create.dishId, states.has(create.dishId) ? { ...states.get(create.dishId), ...update } : create); }) },
      shortageIncident: { createMany: jest.fn(async ({ data }) => { incidents.push(...data); }) } };
    let queue = Promise.resolve();
    tracker = new ShortageTracker({ $transaction: (fn: any) => { const next = queue.then(() => fn(tx)); queue = next.catch(() => {}); return next; } } as any);
  });
  const observe = (self: any, value: any) => self.reconcile(async () => value);
  it('sets baseline, attributes constrained ingredients once, worsening and retries do not add incidents', async () => {
    await observe(tracker, snapshot('AVAILABLE'));
    await observe(tracker, snapshot('LOW_STOCK', [5, 6]));
    await observe(tracker, snapshot('LOW_STOCK', [5, 6]));
    await observe(tracker, snapshot('STOP_LIST', [5, 6]));
    expect(incidents.map(i => i.productId)).toEqual([5, 6]);
    expect(incidents.every(i => i.restaurantId === 1 && i.dishId === 2 && i.episode === 1)).toBe(true);
  });
  it('does not invent incidents on initial shortage, counts only a later recovery and new episode', async () => {
    await observe(tracker, snapshot('STOP_LIST'));
    expect(incidents).toHaveLength(0);
    await observe(tracker, snapshot('AVAILABLE'));
    await observe(tracker, snapshot('STOP_LIST'));
    expect(incidents).toHaveLength(1);
  });
  it('serializes refreshes and obtains source data only after the restaurant lock', async () => {
    await observe(tracker, snapshot('AVAILABLE'));
    await Promise.all(Array.from({ length: 5 }, () => tracker.reconcile(async () => {
      expect(locked).toBe(true); return snapshot('LOW_STOCK');
    })));
    expect(incidents).toHaveLength(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(6);
  });
  it('does not advance state when catalog or stock failed', async () => {
    await expect(tracker.reconcile(async () => { throw new Error('RPC unavailable'); })).rejects.toThrow('RPC unavailable');
    expect(tx.dishAvailability.upsert).not.toHaveBeenCalled();
    expect(tx.shortageTracking.upsert).not.toHaveBeenCalled();
  });
});
