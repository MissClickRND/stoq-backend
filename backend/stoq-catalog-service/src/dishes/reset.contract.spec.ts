jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('src/common/rabbitMQ/command-bus.service', () => ({ CommandBusService: class {} }));
import { DishesService } from './dishes.service';

describe('catalog test reset', () => {
  it('deletes recipes before linked catalog rows and preserves units', async () => {
    const steps: string[] = [];
    const remove = (name: string) => ({ deleteMany: jest.fn(async () => { steps.push(name); return { count: 1 }; }) });
    const tx: any = { recipeItem: remove('recipes'), dish: remove('dishes'), product: remove('products'), unit: remove('units') };
    const prisma: any = { $transaction: jest.fn(async fn => fn(tx)) };
    const service = new DishesService(prisma, {} as any);
    await expect(service.resetBusinessData('')).rejects.toThrow();
    await expect(service.resetBusinessData('RESET')).resolves.toEqual({ dishes: 1, products: 1 });
    expect(steps).toEqual(['recipes', 'dishes', 'products']);
  });
});
