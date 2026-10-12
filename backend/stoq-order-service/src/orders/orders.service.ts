import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddOrderItemsDto } from './dto/add-item.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create() {
    return this.prisma.order.create({
      data: {},
    });
  }

  async addItems(payload: { orderId: number; dto: AddOrderItemsDto }) {
    const { orderId, dto } = payload;

    await this.ensureOrderExists(orderId);

    const dishIds = dto.items.map((item) => item.dishId);

    if (new Set(dishIds).size !== dishIds.length) {
      throw new ConflictException('В списке не должно быть повторяющихся блюд');
    }

    const existingItems = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { dishId: true },
    });

    const existingDishIds = existingItems.map((item) => item.dishId);

    if (dishIds.some((id) => existingDishIds.includes(id))) {
      throw new ConflictException('Одно или несколько блюд уже есть в заказе');
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
