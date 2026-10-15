import { HttpException } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { CommandBusService } from '../../../common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from '../../../common/rabbitMQ/rabbitmq-topology';
import { restaurantStorage } from '../../../common/tenant/restaurant-context';

describe('Public guest menu', () => {
  const dishes = [1, 2, 3].map(id => ({
    id, name: `Dish ${id}`, category: 'Food', description: `Description ${id}`,
    imageURL: `https://example.com/${id}.jpg`, salePrice: 100, availablePortions: id === 3 ? 0 : 5,
    recipeItems: [{ stock: 500 }], costPrice: 20,
  }));
  const sendCommand = jest.fn();
  const controller = new MenuController({ sendCommand } as unknown as CommandBusService);
  beforeEach(() => sendCommand.mockReset());

  it('returns public media and ranked badges using existing recommendation RPC without leaking internals', async () => {
    sendCommand.mockImplementation(async (_exchange, key) => ({ success: true, data:
      key === ROUTING_KEYS.GET_DISHES ? dishes : [
        { dishId: 99, costPrice: 100 }, { dishId: 3 }, { dishId: 2, profit: 80, recommendationScore: 99 }, { dishId: 2 },
      ],
    }));
    expect(await controller.findAll('Dish')).toEqual([
      { id: 2, name: 'Dish 2', category: 'Food', description: 'Description 2', imageURL: 'https://example.com/2.jpg', salePrice: 100, available: true, recommended: true, recommendationRank: 1 },
      { id: 1, name: 'Dish 1', category: 'Food', description: 'Description 1', imageURL: 'https://example.com/1.jpg', salePrice: 100, available: true, recommended: false, recommendationRank: null },
      { id: 3, name: 'Dish 3', category: 'Food', description: 'Description 3', imageURL: 'https://example.com/3.jpg', salePrice: 100, available: false, recommended: false, recommendationRank: null },
    ]);
    expect(sendCommand).toHaveBeenCalledWith(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_DISHES, { search: 'Dish' });
    expect(sendCommand).toHaveBeenCalledWith(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_DISH_RECOMMENDATION, {}, { timeoutMs: 1000 });
  });

  it.each(['timeout', 'rpc-error', 'malformed'])('keeps the catalog and photos when recommendations fail: %s', async failure => {
    sendCommand.mockImplementation(async (_exchange, key) => {
      if (key === ROUTING_KEYS.GET_DISHES) return { success: true, data: dishes };
      if (failure === 'timeout') throw new Error('RabbitMQ timeout');
      return failure === 'rpc-error' ? { success: false, error: { status: 503 } } : { success: true, data: {} };
    });
    const result = await controller.findAll();
    expect(result.map(dish => dish.id)).toEqual([1, 2, 3]);
    expect(result.every(dish => dish.recommended === false && dish.recommendationRank === null)).toBe(true);
    expect(result[0].imageURL).toBe(dishes[0].imageURL);
  });

  it('limits recommendations to ten distinct, available catalog entries', async () => {
    const catalog = Array.from({ length: 12 }, (_, i) => ({ ...dishes[0], id: i + 1 }));
    sendCommand.mockImplementation(async (_exchange, key) => ({ success: true,
      data: key === ROUTING_KEYS.GET_DISHES ? catalog : [...catalog].reverse().map(dish => ({ dishId: dish.id })),
    }));
    const result = await controller.findAll();
    expect(result.filter(dish => dish.recommended).map(dish => dish.id)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect(result).toHaveLength(12);
  });

  it('still fails when the catalog RPC fails', async () => {
    sendCommand.mockResolvedValue({ success: false, error: { status: 503, message: 'Catalog unavailable' } });
    await expect(controller.findAll()).rejects.toThrow(HttpException);
  });

  it('scopes catalog and recommendation RPCs to each guest restaurant', async () => {
    const request = jest.fn(async options => ({ success: true, data:
      options.routingKey === ROUTING_KEYS.GET_DISHES
        ? [{ ...dishes[0], id: options.headers.restaurantId }]
        : [{ dishId: options.headers.restaurantId }],
    }));
    const scopedController = new MenuController(new CommandBusService({ request } as any));
    const [seven, eight] = await Promise.all([7, 8].map(id =>
      restaurantStorage.run(id, () => scopedController.findAll()),
    ));
    expect(seven[0]).toMatchObject({ id: 7, recommended: true, recommendationRank: 1 });
    expect(eight[0]).toMatchObject({ id: 8, recommended: true, recommendationRank: 1 });
    for (const id of [7, 8]) {
      expect(request.mock.calls.filter(([options]) => options.headers.restaurantId === id)
        .map(([options]) => options.routingKey)).toEqual([ROUTING_KEYS.GET_DISHES, ROUTING_KEYS.GET_DISH_RECOMMENDATION]);
    }
  });
});
