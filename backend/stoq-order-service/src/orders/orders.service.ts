import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddOrderItemsDto } from './dto/add-item.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemDto } from './dto/order-item.dto';
import { CommandBusService } from '../common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly commandBusService: CommandBusService) {}

  private async priceItems(items: OrderItemDto[]) {
    return Promise.all(items.map(async item => {
      if (!Number.isSafeInteger(item.dishId) || item.dishId < 1 ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException('Выберите блюдо и положительное целое количество');
      }
      let response: any;
      try {
        response = await this.commandBusService.sendCommand(EXCHANGES.COMMANDS,
          ROUTING_KEYS.GET_DISHES_BY_ID, { id: item.dishId });
      } catch {
        throw new ServiceUnavailableException('Каталог блюд недоступен. Повторите попытку');
      }
      if (!response?.success) {
        throw new HttpException(response?.error?.message ?? 'Каталог блюд недоступен', response?.error?.status ?? 502);
      }
      const dish = response.data;
      if (dish?.id !== item.dishId || typeof dish.name !== 'string' || !dish.name.trim() ||
        typeof dish.salePrice !== 'number' || !Number.isFinite(dish.salePrice) || dish.salePrice < 0) {
        throw new BadRequestException(`Для блюда #${item.dishId} не указана корректная цена продажи`);
      }
      return { dishId: item.dishId, quantity: item.quantity, name: dish.name,
        imageURL: typeof dish.imageURL === 'string' ? dish.imageURL : null,
        price: new Prisma.Decimal(dish.salePrice).toDecimalPlaces(2) };
    }));
  }

  private assertUniqueDishes(items: OrderItemDto[]) {
    const dishIds = items.map((item) => item.dishId);

    if (new Set(dishIds).size !== dishIds.length) {
      throw new ConflictException(
        'В списке не должно быть повторяющихся блюд',
      );
    }
  }

  private async ensureOrderExists(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
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
  }

  async create(dto: CreateOrderDto = {}) {
    const date = dto.date === undefined ? new Date() : new Date(dto.date);
    const type = dto.type ?? 'dine-in';
    const guests = dto.guests ?? 1;
    if (!Number.isFinite(date.getTime()) || (dto.date !== undefined && !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(dto.date)) ||
      !['dine-in', 'takeaway'].includes(type) || !Number.isSafeInteger(guests) || guests < 1 ||
      (dto.table != null && (!Number.isSafeInteger(dto.table) || dto.table < 1)))
      throw new BadRequestException('Некорректная дата, тип заказа, стол или количество человек');
    const items = dto.items ?? [];

    if (items.length > 0) {
      this.assertUniqueDishes(items);
    }

    const data: Prisma.OrderCreateInput = { date, type, guests, table: type === 'takeaway' ? null : dto.table ?? null };

    if (items.length > 0) {
      data.items = {
        create: await this.priceItems(items),
      };
    }

    return this.toResponse(await this.prisma.order.create({
      data,
      include: {
        items: true,
      },
    }));
  }

  async addItems(payload: { orderId: number; dto: AddOrderItemsDto }) {
    const { orderId, dto } = payload;

    await this.ensureOrderExists(orderId);

    this.assertUniqueDishes(dto.items);

    const dishIds = dto.items.map((item) => item.dishId);

    const existingItems = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { dishId: true },
    });

    const existingDishIds = existingItems.map((item) => item.dishId);

    if (dishIds.some((id) => existingDishIds.includes(id))) {
      throw new ConflictException(
        'Одно или несколько блюд уже есть в заказе',
      );
    }

    const pricedItems = await this.priceItems(dto.items);
    await this.prisma.$transaction(
      pricedItems.map((item) =>
        this.prisma.orderItem.create({
          data: {
            orderId,
            ...item,
          },
        }),
      ),
    );

    return this.findOne(orderId);
  }

  async findAll() {
    const orders = await this.prisma.order.findMany({
      where: {
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
      where: { id },
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
      return { ...item, name: item.name ?? null, imageURL: item.imageURL ?? null,
        price: price?.toNumber() ?? null,
        totalPrice: price?.mul(item.quantity).toDecimalPlaces(2).toNumber() ?? null };
    });
    const totalPrice = items.some(item => item.totalPrice === null) ? null :
      items.reduce((sum: Prisma.Decimal, item: any) => sum.add(new Prisma.Decimal(item.price).mul(item.quantity)),
        new Prisma.Decimal(0)).toDecimalPlaces(2).toNumber();
    return { ...order, items, totalPrice, date: new Date(order.date).toISOString(),
      created_at: order.created_at ? new Date(order.created_at).toISOString() : undefined,
      updated_at: order.updated_at ? new Date(order.updated_at).toISOString() : undefined };
  }

  async changeStatus(payload: { id: number; status: OrderStatus }) {
    await this.ensureOrderExists(payload.id);

    return this.toResponse(await this.prisma.order.update({
      where: { id: payload.id },
      data: {
        status: payload.status,
      },
      include: { items: true },
    }));
  }

  async remove(id: number) {
    await this.ensureOrderExists(id);

    await this.prisma.$transaction([
      this.prisma.orderItem.deleteMany({
        where: { orderId: id },
      }),
      this.prisma.order.delete({
        where: { id },
      }),
    ]);

    return { message: `Заказ ${id} успешно удалён` };
  }
}
