import { HttpException, Injectable } from '@nestjs/common';
import { CommandBusService } from '../../common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from '../../common/rabbitMQ/rabbitmq-topology';
import { restaurantStorage } from '../../common/tenant/restaurant-context';

@Injectable()
export class DemoRestaurantService {
  constructor(private readonly bus: CommandBusService) {}

  private data<T>(response: any): T {
    if (response?.success !== true) throw new HttpException(
      response?.error?.message ?? 'Сервис тестовых данных недоступен', response?.error?.status ?? 503,
    );
    return response.data as T;
  }

  seed(id: number) {
    return restaurantStorage.run(id, async () => {
      const now = new Date();
      const units: { id: number; shortName: string }[] = [];
      for (const [name, shortName] of [['Килограмм', 'кг'], ['Литр', 'л'], ['Штука', 'шт.']]) {
        units.push(this.data(await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.CREATE_UNIT, { dto: { name, shortName } })));
      }
      const products = [
        { name: 'Мука пшеничная', unit: 'кг', quantity: 20, totalPrice: 1200, days: 180 },
        { name: 'Молоко', unit: 'л', quantity: 12, totalPrice: 1200, days: 7 },
        { name: 'Яйцо куриное', unit: 'шт.', quantity: 60, totalPrice: 600, days: 21 },
        { name: 'Томаты', unit: 'кг', quantity: 10, totalPrice: 1800, days: 3 },
        { name: 'Моцарелла', unit: 'кг', quantity: 5, totalPrice: 2000, days: 14 },
        { name: 'Масло растительное', unit: 'л', quantity: 3, totalPrice: 900, days: 365 },
      ];
      const catalog = this.data<{ id: number; name: string }[]>(await this.bus.sendCommand(
        EXCHANGES.COMMANDS, ROUTING_KEYS.CREATE_MANY_PRODUCT,
        products.map(product => ({ name: product.name, unitId: units.find(unit => unit.shortName === product.unit)!.id })),
      ));
      const productId = (index: number) => {
        const found = catalog.find(product => product.name === products[index].name);
        if (!found) throw new HttpException('Каталог вернул неполный набор тестовых продуктов', 502);
        return found.id;
      };
      const expires = (days: number) => new Date(now.getTime() + days * 86400000).toISOString();
      const supply = this.data<{ id: number }>(await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.CREATE_SUPPLY, { dto: {
        supplyNumber: `ДЕМО-${id}`, supplier: 'Демо-поставщик', status: 'RECEIVED', receivedAt: now.toISOString(),
        items: products.map((product, index) => ({ productId: productId(index), quantity: product.quantity,
          totalPrice: product.totalPrice, expiresAt: expires(product.days) })),
      } }));
      const dishes = this.data<{ id: number }[]>(await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.CREATE_DISHES_MANY, { dtos: [
        { name: 'Омлет с томатами', category: 'Завтраки', description: 'Яйца, молоко и томаты', salePrice: 320,
          recipeItems: [{ productId: productId(2), quantity: 2 }, { productId: productId(1), quantity: 0.1 }, { productId: productId(3), quantity: 0.15 }] },
        { name: 'Капрезе', category: 'Салаты', description: 'Томаты и моцарелла', salePrice: 450,
          recipeItems: [{ productId: productId(3), quantity: 0.2 }, { productId: productId(4), quantity: 0.15 }, { productId: productId(5), quantity: 0.01 }] },
        { name: 'Блины', category: 'Завтраки', description: 'Блины на молоке', salePrice: 250,
          recipeItems: [{ productId: productId(0), quantity: 0.1 }, { productId: productId(1), quantity: 0.2 }, { productId: productId(2), quantity: 1 }] },
      ] }));
      const external = this.data<{ id: number }>(await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.CREATE_SUPPLY, { dto: {
        supplyNumber: `ДЕМО-В-ПУТИ-${id}`, supplier: 'Внешний демо-поставщик', status: 'IN_TRANSIT', receivedAt: now.toISOString(),
        items: [{ productId: productId(0), quantity: 5, totalPrice: 300, expiresAt: expires(180) }],
      } }));
      const order = this.data<{ id: number }>(await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.CREATE_ORDER, { dto: {
        date: now.toISOString(), type: 'dine-in', table: 1, guests: 2,
        items: [{ dishId: dishes[0].id, quantity: 1 }, { dishId: dishes[1].id, quantity: 1 }],
      } }));
      return { products: catalog.length, dishes: dishes.length, supplies: 2, orders: 1,
        supplyId: supply.id, externalSupplyId: external.id, orderId: order.id };
    });
  }
}
