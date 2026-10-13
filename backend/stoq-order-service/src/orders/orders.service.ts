import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddOrderItemsDto } from './dto/add-item.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemDto } from './dto/order-item.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

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
    const items = dto.items ?? [];

    if (items.length > 0) {
      this.assertUniqueDishes(items);
    }

    const data: Prisma.OrderCreateInput = {};

    if (items.length > 0) {
      data.items = {
        create: items.map((item) => ({
          dishId: item.dishId,
          quantity: item.quantity,
        })),
      };
    }

    return this.prisma.order.create({
      data,
      include: {
        items: true,
      },
    });
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

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.orderItem.create({
          data: {
            orderId,
            dishId: item.dishId,
            quantity: item.quantity,
          },
        }),
      ),
    );

    return this.findOne(orderId);
  }

  async findAll() {
    return this.prisma.order.findMany({
      where: {
        status: {
          notIn: [
            OrderStatus.rejected,
            OrderStatus.cancelled,
            OrderStatus.completed,
          ],
        },
      },
      include: {
        items: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
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

    return order;
  }

  async changeStatus(payload: { id: number; status: OrderStatus }) {
    await this.findOne(payload.id);

    return this.prisma.order.update({
      where: { id: payload.id },
      data: {
        status: payload.status,
      },
    });
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