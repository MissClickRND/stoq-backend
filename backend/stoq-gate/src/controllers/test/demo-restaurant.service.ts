import { HttpException, Injectable } from '@nestjs/common';
import { CommandBusService } from '../../common/rabbitMQ/command-bus.service';
import {
  EXCHANGES,
  ROUTING_KEYS,
} from '../../common/rabbitMQ/rabbitmq-topology';
import { restaurantStorage } from '../../common/tenant/restaurant-context';
import { AuditService } from '../../audit/audit.service';
type DemoActor = { id: number; fullName: string; role: string };
@Injectable()
export class DemoRestaurantService {
  constructor(
    private readonly bus: CommandBusService,
    private readonly audit: AuditService,
  ) {}
  private data<T>(response: any): T {
    if (response?.success !== true)
      throw new HttpException(
        response?.error?.message ?? 'Сервис демо-данных недоступен',
        response?.error?.status ?? 503,
      );
    return response.data;
  }
  seed(id: number, accounts: DemoActor[] = []) {
    return restaurantStorage.run(id, async () => {
      const now = new Date();
      const admin = accounts.find((a) => a.role === 'ADMIN') ?? {
        id: null,
        fullName: 'Система',
        role: 'SYSTEM',
      };
      const stockkeeper =
        accounts.find((a) => a.role === 'STOREKEEPER') ?? admin;
      const operators = accounts.filter((a) =>
        ['ADMIN', 'MANAGER', 'WAITER'].includes(a.role),
      );
      const request = async <T>(
        key: string,
        payload: any,
        method?: string,
        path?: string,
        actor: any = admin,
      ): Promise<T> => {
        const result = this.data<T>(
          await this.bus.sendCommand(EXCHANGES.COMMANDS, key, payload, {
            timeoutMs: 30000,
          }),
        );
        if (method && path)
          await this.audit.record(
            {
              method,
              path,
              body: payload.dto ?? payload,
              restaurantId: id,
              user: actor,
            },
            result,
          );
        return result;
      };
      const units: { id: number; shortName: string }[] = [];
      for (const [name, shortName] of [
        ['Килограмм', 'кг'],
        ['Литр', 'л'],
        ['Штука', 'шт.'],
        ['Грамм', 'г'],
        ['Миллилитр', 'мл'],
        ['Порция', 'порц.'],
        ['Упаковка', 'уп.'],
        ['Коробка', 'кор.'],
        ['Бутылка', 'бут.'],
        ['Банка', 'бан.'],
      ]) {
        units.push(
          await request(
            ROUTING_KEYS.CREATE_UNIT,
            { dto: { name, shortName } },
            'POST',
            '/product/units',
          ),
        );
      }
      const products = [
        ['Мука пшеничная', 'кг', 80],
        ['Молоко', 'л', 100],
        ['Яйцо куриное', 'шт.', 12],
        ['Томаты', 'кг', 180],
        ['Моцарелла', 'кг', 500],
        ['Масло растительное', 'л', 200],
        ['Картофель', 'кг', 60],
        ['Куриное филе', 'кг', 420],
        ['Шампиньоны', 'кг', 300],
        ['Рис', 'кг', 120],
      ] as const;
      const catalog = await request<{ id: number; name: string }[]>(
        ROUTING_KEYS.CREATE_MANY_PRODUCT,
        products.map(([name, unit]) => ({
          name,
          unitId: units.find((u) => u.shortName === unit)!.id,
        })),
        'POST',
        '/product/few',
      );
      const pid = (index: number) => {
        const product = catalog.find((p) => p.name === products[index][0]);
        if (!product)
          throw new HttpException('Каталог вернул неполные демо-продукты', 502);
        return product.id;
      };
      let supplyId: number | undefined, externalSupplyId: number | undefined;
      for (let i = 0; i < 10; i++) {
        const expired = i === 7;
        const status =
          i === 8 ? 'IN_TRANSIT' : i === 9 ? 'CANCELLED' : 'RECEIVED';
        const receivedAt = new Date(
          now.getTime() - (expired ? 2 : 10 - i) * 86400000,
        ).toISOString();
        const items = products.map((p, j) => ({
          productId: pid(j),
          quantity: j === 2 ? 40 : 20,
          totalPrice: (j === 2 ? 40 : 20) * p[2],
          expiresAt: new Date(
            now.getTime() +
              (expired ? -1 : [1, 3, 7, 14, 30][(i + j) % 5]) * 86400000,
          ).toISOString(),
        }));
        const supply = await request<{ id: number }>(
          ROUTING_KEYS.CREATE_SUPPLY,
          {
            dto: {
              supplyNumber: `ДЕМО-${id}-${String(i + 1).padStart(2, '0')}`,
              supplier: [
                'Ферма «Урожай»',
                'ООО «Свежие продукты»',
                'Молочная ферма «Луга»',
              ][i % 3],
              status,
              receivedAt,
              items,
            },
          },
          'POST',
          '/supplies',
          stockkeeper,
        );
        if (i === 0) supplyId = supply.id;
        if (i === 8) externalSupplyId = supply.id;
      }
      const recipes: [string, string, number, [number, number][]][] = [
        [
          'Омлет с томатами',
          'Завтраки',
          320,
          [
            [2, 2],
            [1, 0.1],
            [3, 0.15],
          ],
        ],
        [
          'Капрезе',
          'Салаты',
          450,
          [
            [3, 0.2],
            [4, 0.15],
            [5, 0.01],
          ],
        ],
        [
          'Блины',
          'Завтраки',
          250,
          [
            [0, 0.1],
            [1, 0.2],
            [2, 1],
          ],
        ],
        [
          'Драники',
          'Горячее',
          290,
          [
            [6, 0.25],
            [2, 1],
            [5, 0.02],
          ],
        ],
        [
          'Курица с рисом',
          'Горячее',
          490,
          [
            [7, 0.18],
            [9, 0.1],
            [5, 0.01],
          ],
        ],
        [
          'Грибной суп',
          'Супы',
          340,
          [
            [8, 0.12],
            [6, 0.15],
            [1, 0.1],
          ],
        ],
        [
          'Сырники',
          'Завтраки',
          390,
          [
            [4, 0.15],
            [0, 0.04],
            [2, 1],
          ],
        ],
        [
          'Рис с овощами',
          'Гарниры',
          240,
          [
            [9, 0.15],
            [3, 0.1],
            [5, 0.02],
          ],
        ],
        [
          'Курица с грибами',
          'Горячее',
          550,
          [
            [7, 0.18],
            [8, 0.1],
            [5, 0.01],
          ],
        ],
        [
          'Томатный суп',
          'Супы',
          310,
          [
            [3, 0.3],
            [1, 0.05],
            [5, 0.02],
          ],
        ],
      ];
      const dishes = await request<{ id: number }[]>(
        ROUTING_KEYS.CREATE_DISHES_MANY,
        {
          dtos: recipes.map(([name, category, salePrice, ingredients]) => ({
            name,
            category,
            salePrice,
            description: `${name}. Состав: ${ingredients.map(([p]) => products[p][0].toLowerCase()).join(', ')}.`,
            recipeItems: ingredients.map(([p, quantity]) => ({
              productId: pid(p),
              quantity,
            })),
          })),
        },
        'POST',
        '/dishes/batch',
      );
      const available = [0, 1, 2, 3, 6, 9];
      let orderId: number | undefined;
      for (let i = 0; i < 10; i++) {
        const creator = operators[i % Math.max(operators.length, 1)] ?? admin;
        const indexes = [
          available[i % available.length],
          available[(i + 1) % available.length],
        ];
        const order = await request<{ id: number }>(
          ROUTING_KEYS.CREATE_ORDER,
          {
            dto: {
              date: new Date(now.getTime() - (9 - i) * 86400000).toISOString(),
              type: i % 3 === 0 ? 'takeaway' : 'dine-in',
              table: i % 3 === 0 ? null : i + 1,
              guests: 1 + (i % 4),
              items: indexes.map((index, j) => ({
                dishId: dishes[index].id,
                quantity: 1 + ((i + j) % 2),
              })),
            },
            creator: {
              id: creator.id,
              name: creator.fullName,
              role: creator.role,
              source: creator.id ? 'EMPLOYEE' : 'SYSTEM',
            },
          },
          'POST',
          '/orders',
          creator,
        );
        orderId = order.id;
        if (i < 6 || i === 9 || i === 7) {
          const status = i === 7 ? 'rejected' : 'completed';
          await request(
            ROUTING_KEYS.CHANGE_ORDER_STATUS,
            { id: order.id, status },
            'PATCH',
            `/orders/${order.id}/status`,
            creator,
          );
        }
      }
      await request(ROUTING_KEYS.EXPIRE_INVENTORY, {});
      await request(ROUTING_KEYS.GET_DISH_STATISTICS, { forceRefresh: true });
      const batches = await request<any[]>(ROUTING_KEYS.GET_INVENTORY, {});
      let mushroomAssigned = false;
      let riceAssigned = false;
      const items = batches
        .filter((b) => [pid(8), pid(9)].includes(b.productId))
        .map((b) => {
          const quantity =
            b.productId === pid(8) && !mushroomAssigned
              ? 0.25
              : b.productId === pid(9) && !riceAssigned
                ? 0.05
                : 0;
          if (b.productId === pid(8)) mushroomAssigned = true;
          if (b.productId === pid(9)) riceAssigned = true;
          return { batchId: b.id, quantity };
        });
      if (items.length)
        await request(
          ROUTING_KEYS.UPDATE_QUANTITY_INVENTORY,
          {
            dto: { items, includeReport: true },
            actor: {
              id: stockkeeper.id,
              name: stockkeeper.fullName,
              role: stockkeeper.role,
            },
          },
          'PUT',
          '/inventory',
          stockkeeper,
        );
      await request(ROUTING_KEYS.GET_DISH_STATISTICS, { forceRefresh: true });
      return {
        units: units.length,
        products: catalog.length,
        dishes: dishes.length,
        supplies: 10,
        orders: 10,
        employees: 10,
        invitations: 10,
        supplyId,
        externalSupplyId,
        orderId,
      };
    });
  }
}
