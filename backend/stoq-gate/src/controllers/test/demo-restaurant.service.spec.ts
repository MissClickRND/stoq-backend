import { DemoRestaurantService } from './demo-restaurant.service';
import { restaurantId, restaurantStorage } from '../../common/tenant/restaurant-context';
import { ROUTING_KEYS } from '../../common/rabbitMQ/rabbitmq-topology';

describe('separate demo restaurant fixture', () => {
  it('creates linked data using existing commands exclusively under the new restaurant', async () => {
    let unitId = 0;
    const tenantIds: number[] = [];
    const sendCommand = jest.fn(async (_exchange, key, payload) => {
      tenantIds.push(restaurantId());
      let data: unknown;
      if (key === ROUTING_KEYS.CREATE_UNIT) data = { id: ++unitId, ...payload.dto };
      else if (key === ROUTING_KEYS.CREATE_MANY_PRODUCT) data = payload.map((product: any, index: number) => ({ ...product, id: index + 10 }));
      else if (key === ROUTING_KEYS.CREATE_DISHES_MANY) data = payload.dtos.map((dish: any, index: number) => ({ ...dish, id: index + 20 }));
      else data = { id: 30 };
      return { success: true, data };
    });
    const service = new DemoRestaurantService({ sendCommand } as any);
    await restaurantStorage.run(5, async () => {
      expect(await service.seed(77)).toMatchObject({ products: 6, dishes: 3, supplies: 2, orders: 1 });
      expect(restaurantId()).toBe(5);
    });
    expect(tenantIds.every(id => id === 77)).toBe(true);
    expect(sendCommand.mock.calls.map(call => call[1])).toEqual([
      ROUTING_KEYS.CREATE_UNIT, ROUTING_KEYS.CREATE_UNIT, ROUTING_KEYS.CREATE_UNIT,
      ROUTING_KEYS.CREATE_MANY_PRODUCT, ROUTING_KEYS.CREATE_SUPPLY,
      ROUTING_KEYS.CREATE_DISHES_MANY, ROUTING_KEYS.CREATE_SUPPLY, ROUTING_KEYS.CREATE_ORDER,
    ]);
    const supply = sendCommand.mock.calls.find(call => call[1] === ROUTING_KEYS.CREATE_SUPPLY)![2].dto;
    const dishes = sendCommand.mock.calls.find(call => call[1] === ROUTING_KEYS.CREATE_DISHES_MANY)![2].dtos;
    expect(supply.items.map((item: any) => item.productId)).toEqual([10, 11, 12, 13, 14, 15]);
    expect(dishes[0].recipeItems[0].productId).toBe(12);
    expect(sendCommand.mock.calls.at(-1)![2].dto.items).toEqual([{ dishId: 20, quantity: 1 }, { dishId: 21, quantity: 1 }]);
  });

  it('stops on a failed service response without resetting or touching real data', async () => {
    const sendCommand = jest.fn().mockResolvedValueOnce({ success: false, error: { status: 503, message: 'Catalog unavailable' } });
    await expect(new DemoRestaurantService({ sendCommand } as any).seed(77)).rejects.toThrow('Catalog unavailable');
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });
});
