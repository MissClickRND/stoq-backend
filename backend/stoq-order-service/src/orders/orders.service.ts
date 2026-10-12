import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddOrderItemsDto } from './dto/add-item.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureOrderExists(orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        status: {
          notIn: [
            OrderStatus.rejected,
            OrderStatus.cancelled,
            OrderStatus.completed,
          ],
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Заказ с ID ${orderId} не найден`);
    }
  }

  // private async ensureDishesExist(
  //   items: { productId: number; quantity: number }[],
  // ) {
  //   const productIds = items.map((item) => item.productId);

  //   if (new Set(productIds).size !== productIds.length) {
  //     throw new BadRequestException(
  //       'В списке не должно быть повторяющихся продуктов',
  //     );
  //   }

  //   const products = await this.prisma.product.findMany({
  //     where: {
  //       id: { in: productIds },
  //       isDeleted: false,
  //     },
  //     select: {
  //       id: true,
  //     },
  //   });

  //   if (products.length !== productIds.length) {
  //     throw new BadRequestException(
  //       'Один или несколько продуктов не существуют или удалены',
  //     );
  //   }
  // }

  async create(data) {
    try {
      return await this.prisma.order.create({
        data: {
          name: data.name.trim(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Блюдо с таким названием уже существует');
      }

      throw error;
    }
  }

  async addItems(payload: { orderId: number; dto: AddOrderItemsDto }) {
    await this.ensureDishExists(payload.orderId);

    const existingItems = await this.prisma.orderItem.findMany({
      where: { orderId: payload.orderId },
      select: { dishId: true },
    });

    const existingProductIds = new Set(
      existingItems.map((item) => item.dishId),
    );

    if (
      payload.dto.items.some((item) => existingProductIds.has(item.productId))
    ) {
      throw new ConflictException('Один или несколько блюд уже есть в заказе');
    }

    await this.prisma.$transaction(
      payload.dto.items.map((item) =>
        this.prisma.orderItem.create({
          data: {
            dishId,
            productId: item.productId,
            quantity: item.quantity,
          },
        }),
      ),
    );

    return this.findOne(dishId);
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
    });
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
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
}
