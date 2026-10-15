import { restaurantId } from '../common/tenant/restaurant-context';
import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
  HttpException,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddOrderItemsDto } from './dto/add-item.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemDto } from './dto/order-item.dto';
import { CommandBusService } from '../common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';
import { OrderEventPublisher } from './order-event.publisher';

interface ResolvedOrderItem extends OrderItemDto {
  dish: {
    id: number;
    name: string;
    imageURL?: string;
    salePrice: number;
    recipeItems: { productId: number; quantity: number }[];
  };
}

interface InventoryItem {
  productId: number;
  quantity: number;
}

@Injectable()
export class OrdersService {
  private readonly creationQueues = new Map<number, Promise<void>>();

  async create(dto: CreateOrderDto = {}) {
    const tenant = restaurantId();
    const previous = this.creationQueues.get(tenant) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.creationQueues.set(tenant, current);
    await previous;
    try {
      return await this.createInOrder(dto);
    } finally {
      release();
      if (this.creationQueues.get(tenant) === current) this.creationQueues.delete(tenant);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBusService: CommandBusService,
    private readonly eventPublisher: OrderEventPublisher,
  ) {}

  async resetBusinessData(confirmation: string) {
    if (
      confirmation !== 'RESET' ||
      (process.env.NODE_ENV === 'production' &&
        process.env.ENABLE_TEST_TOOLS !== 'true')
    ) {
      throw new ForbiddenException('Сброс тестовых данных отключён');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { order: { restaurantId: restaurantId() } }, });
      const orders = await tx.order.deleteMany({ where: { restaurantId: restaurantId() }, });
      return { orders: orders.count };
    });
  }

  private async resolveItems(
    items: OrderItemDto[],
  ): Promise<ResolvedOrderItem[]> {
    return Promise.all(
      items.map(async (item) => {
        if (
          !Number.isSafeInteger(item.dishId) ||
          item.dishId < 1 ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1
        ) {
          throw new BadRequestException(
            'Выберите блюдо и положительное целое количество',
          );
        }
        let response: any;
        try {
          response = await this.commandBusService.sendCommand(
            EXCHANGES.COMMANDS,
            ROUTING_KEYS.GET_DISHES_BY_ID,
            { id: item.dishId },
          );
        } catch {
          throw new ServiceUnavailableException(
            'Каталог блюд недоступен. Повторите попытку',
          );
        }
        if (!response?.success) {
          throw new HttpException(
            response?.error?.message ?? 'Каталог блюд недоступен',
            response?.error?.status ?? 502,
          );
        }
        const dish = response.data;
        if (dish?.id !== item.dishId) {
          throw new BadRequestException(
            `Некорректные данные блюда #${item.dishId}`,
          );
        }
        return { ...item, dish };
      }),
    );
  }

  private priceItems(items: ResolvedOrderItem[]) {
    return items.map(({ dish, ...item }) => {
      if (
        dish?.id !== item.dishId ||
        typeof dish.name !== 'string' ||
        !dish.name.trim() ||
        typeof dish.salePrice !== 'number' ||
        !Number.isFinite(dish.salePrice) ||
        dish.salePrice < 0
      ) {
        throw new BadRequestException(
          `Для блюда #${item.dishId} не указана корректная цена продажи`,
        );
      }
      return {
        dishId: item.dishId,
        quantity: item.quantity,
        name: dish.name,
        imageURL: typeof dish.imageURL === 'string' ? dish.imageURL : null,
        price: new Prisma.Decimal(dish.salePrice).toDecimalPlaces(2),
      };
    });
  }

  private toInventoryItems(items: ResolvedOrderItem[]): InventoryItem[] {
    const quantities = new Map<number, Prisma.Decimal>();
    for (const { dish, quantity } of items) {
      if (!Array.isArray(dish.recipeItems) || !dish.recipeItems.length) {
        throw new BadRequestException(
          `Для блюда #${dish.id} не указана рецептура`,
        );
      }
      for (const ingredient of dish.recipeItems) {
        if (
          !Number.isSafeInteger(ingredient?.productId) ||
          ingredient.productId < 1 ||
          typeof ingredient.quantity !== 'number' ||
          !Number.isFinite(ingredient.quantity) ||
          ingredient.quantity <= 0
        ) {
          throw new BadRequestException(
            `Некорректная рецептура блюда #${dish.id}`,
          );
        }
        const total = (
          quantities.get(ingredient.productId) ?? new Prisma.Decimal(0)
        ).add(new Prisma.Decimal(ingredient.quantity).mul(quantity));
        quantities.set(ingredient.productId, total);
      }
    }
    return Array.from(quantities, ([productId, quantity]) => ({
      productId,
      quantity: quantity.toNumber(),
    }));
  }

  private assertUniqueDishes(items: OrderItemDto[]) {
    const dishIds = items.map((item) => item.dishId);

    if (new Set(dishIds).size !== dishIds.length) {
      throw new ConflictException('В списке не должно быть повторяющихся блюд');
    }
  }

  private async ensureOrderExists(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { restaurantId: restaurantId(),  id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Заказ с ID ${orderId} не найден`);
    }

    if (
      order.status === OrderStatus.rejected ||
      order.status === OrderStatus.cancelled ||
      order.status === OrderStatus.completed
    ) {
      throw new ConflictException(
        'Нельзя изменять завершённый или отменённый заказ',
      );
    }
    return order;
  }

  private async checkStockAvailability(inventoryItems: InventoryItem[]) {
    let response: any;
    try {
      response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.CHECK_STOCK_INVENTORY,
        { dto: inventoryItems },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Сервис склада недоступен для проверки остатков',
      );
    }

    if (!response?.success) {
      throw new HttpException(
        {
          statusCode: response?.error?.status ?? 400,
          message: response?.error?.message ?? 'Недостаточно товаров на складе',
          products: response?.error?.products ?? [],
        },
        response?.error?.status ?? 400,
      );
    }
  }

  private async deductStock(
    orderId: number,
    inventoryItems: InventoryItem[],
  ) {
    let response: any;
    try {
      response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.DEDUCT_STOCK_INVENTORY,
        {
          dto: {
            idempotencyKey: `order-${orderId}-deduction`,
            orderId: String(orderId),
            items: inventoryItems,
          },
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Сервис склада недоступен для списания товаров',
      );
    }

    if (!response?.success) {
      throw new HttpException(
        {
          statusCode: response?.error?.status ?? 400,
          message: response?.error?.message ?? 'Ошибка списания товаров со склада',
          products: response?.error?.products ?? [],
        },
        response?.error?.status ?? 400,
      );
    }
  }

  private async createInOrder(dto: CreateOrderDto) {
    const date = dto.date === undefined ? new Date() : new Date(dto.date);
    const type = dto.type ?? 'dine-in';
    const guests = dto.guests ?? 1;
    if (
      !Number.isFinite(date.getTime()) ||
      (dto.date !== undefined && !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(dto.date)) ||
      !['dine-in', 'takeaway'].includes(type) ||
      !Number.isSafeInteger(guests) ||
      guests < 1 ||
      (dto.table != null && (!Number.isSafeInteger(dto.table) || dto.table < 1))
    )
      throw new BadRequestException(
        'Некорректная дата, тип заказа, стол или количество человек',
      );
    const items = dto.items ?? [];

    if (items.length > 0) {
      this.assertUniqueDishes(items);
    }
    const resolvedItems = await this.resolveItems(items);
    const pricedItems = this.priceItems(resolvedItems);
    if (items.length > 0) {
      await this.checkStockAvailability(this.toInventoryItems(resolvedItems));
    }

    const data: Prisma.OrderCreateInput = {
      status: items.length ? OrderStatus.pending_reservation : OrderStatus.created,
      date,
      type,
      guests,
      table: type === 'takeaway' ? null : (dto.table ?? null),
    };

    if (items.length > 0) {
      data.items = {
        create: pricedItems,
      };
    }

    let order = this.toResponse(
      await this.prisma.order.create({
        data: { ...data, restaurantId: restaurantId() },
        include: {
          items: true,
        },
      }),
    );
    if (items.length) {
      try {
        await this.deductStock(order.id, this.toInventoryItems(resolvedItems));
      } catch (error) {
        // Timeouts are ambiguous: keep pending until stock is reconciled.
        if (error instanceof HttpException && error.getStatus() < 500) {
          await this.prisma.order.update({
            where: { restaurantId: restaurantId(), id: order.id },
            data: { status: OrderStatus.rejected },
          });
        }
        throw error;
      }
      order = this.toResponse(await this.prisma.order.update({
        where: { restaurantId: restaurantId(), id: order.id },
        data: { status: OrderStatus.created },
        include: { items: true },
      }));
    }
    await this.eventPublisher.publishOrderCreated(order);

    return order;
  }

  async addItems(payload: { orderId: number; dto: AddOrderItemsDto }) {
    await this.ensureOrderExists(payload.orderId);
    throw new ConflictException('Состав заказа уже зафиксирован. Создайте новый заказ с нужными блюдами');
  }

  async findAll() {
    const orders = await this.prisma.order.findMany({
      where: { restaurantId: restaurantId(),
        status: {
          notIn: [OrderStatus.rejected, OrderStatus.cancelled],
        },
      },
      include: {
        items: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    return orders.map((order) => this.toResponse(order));
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { restaurantId: restaurantId(),  id },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Заказ с ID ${id} не найден`);
    }

    return this.toResponse(order);
  }

  private toResponse(order: any) {
    const items = (order.items ?? []).map((item: any) => {
      const price = item.price == null ? null : new Prisma.Decimal(item.price);
      return {
        ...item,
        name: item.name ?? null,
        imageURL: item.imageURL ?? null,
        price: price?.toNumber() ?? null,
        totalPrice:
          price?.mul(item.quantity).toDecimalPlaces(2).toNumber() ?? null,
      };
    });
    const totalPrice = items.some((item) => item.totalPrice === null)
      ? null
      : items
          .reduce(
            (sum: Prisma.Decimal, item: any) =>
              sum.add(new Prisma.Decimal(item.price).mul(item.quantity)),
            new Prisma.Decimal(0),
          )
          .toDecimalPlaces(2)
          .toNumber();
    return {
      ...order,
      items,
      totalPrice,
      date: new Date(order.date).toISOString(),
      created_at: order.created_at
        ? new Date(order.created_at).toISOString()
        : undefined,
      updated_at: order.updated_at
        ? new Date(order.updated_at).toISOString()
        : undefined,
    };
  }

  async changeStatus(payload: { id: number; status: OrderStatus }) {
    if (payload.status !== OrderStatus.completed && payload.status !== OrderStatus.rejected) {
      throw new BadRequestException('Допустимые статусы: completed, rejected');
    }
    const current = await this.ensureOrderExists(payload.id);
    if (current.status === OrderStatus.pending_reservation) {
      throw new ConflictException('Списание по заказу ещё не подтверждено. Проверьте состояние склада');
    }
    const order = await this.prisma.order.update({
      where: { restaurantId: restaurantId(), id: payload.id, status: current.status },
      data: { status: payload.status },
      include: { items: true },
    });
    return this.toResponse(order);
  }

  async remove(id: number) {
    const current = await this.ensureOrderExists(id);
    if (current.status === OrderStatus.pending_reservation) {
      throw new ConflictException('Списание по заказу ещё не подтверждено. Проверьте состояние склада');
    }

    await this.prisma.$transaction([
      this.prisma.orderItem.deleteMany({
        where: { order: { restaurantId: restaurantId() },  orderId: id },
      }),
      this.prisma.order.delete({
        where: { restaurantId: restaurantId(),  id },
      }),
    ]);

    return { message: `Заказ ${id} успешно удалён` };
  }

  async getTodayStatistics() {
    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfTomorrow = new Date(startOfDay);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const orders = await this.prisma.order.findMany({
      where: { restaurantId: restaurantId(),
        created_at: {
          gte: startOfDay,
          lt: startOfTomorrow,
        },
      },
      select: {
        status: true,
        items: {
          select: {
            price: true,
            quantity: true,
          },
        },
      },
    });

    const activeStatuses: OrderStatus[] = [
      OrderStatus.created,
      OrderStatus.pending_reservation,
      OrderStatus.confirmed,
    ];

    const completedOrders = orders.filter(
      (order) => order.status === OrderStatus.completed,
    );

    const active = orders.filter((order) =>
      activeStatuses.includes(order.status),
    ).length;

    const revenue = completedOrders.reduce((total, order) => {
      const orderTotal = order.items.reduce((sum, item) => {
        if (item.price === null) {
          return sum.add(
            (item.price ?? new Prisma.Decimal(0)).mul(item.quantity),
          );
        }

        return sum.add(item.price.mul(item.quantity));
      }, new Prisma.Decimal(0));

      return total.add(orderTotal);
    }, new Prisma.Decimal(0));

    const cancelled = orders.filter(
      (o) => o.status === OrderStatus.cancelled,
    ).length;

    return {
      total: orders.length,
      completed: completedOrders.length,
      cancelled,
      revenue: revenue.toDecimalPlaces(2).toString(),
      active,
    };
  }
}
