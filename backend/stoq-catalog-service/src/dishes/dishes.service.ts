import {
  ConflictException,
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDishDto } from "./dto/create-dish.dto";
import { EXCHANGES, ROUTING_KEYS } from "src/common/rabbitMQ/rabbitmq-topology";
import { CommandBusService } from "src/common/rabbitMQ/command-bus.service";

@Injectable()
export class DishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBusService: CommandBusService,
  ) {}

  async resetBusinessData(confirmation: string) {
    if (confirmation !== 'RESET' || (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_TOOLS !== 'true')) {
      throw new ForbiddenException('Сброс тестовых данных отключён');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({});
      const dishes = await tx.dish.deleteMany({});
      const products = await tx.product.deleteMany({});
      return { dishes: dishes.count, products: products.count };
    });
    return result;
  }

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  async create(data: CreateDishDto) {
    const ids = data.recipeItems.map((item) => item.productId);
    if (new Set(ids).size !== ids.length || !ids.length)
      throw new BadRequestException(
        "Добавьте ингредиенты без повторяющихся продуктов",
      );
    const count = await this.prisma.product.count({
      where: { id: { in: ids }, isDeleted: false },
    });
    if (count !== ids.length)
      throw new BadRequestException(
        "Один или несколько продуктов не существуют или удалены",
      );
    const stock = await this.fetchStock(ids);
    try {
      const dish = await this.prisma.dish.create({
        data: {
          name: data.name.trim(),
          description: data.description?.trim(),
          imageURL: data.imageURL?.trim(),
          salePrice: data.salePrice,
          category: data.category?.trim(),
          recipeItems: {
            create: data.recipeItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          recipeItems: { include: { product: { include: { unit: true } } } },
        },
      });
      return (await this.enrichWithStock([dish], stock))[0];
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Блюдо с таким названием уже существует");
      }

      throw error;
    }
  }

  async createMany(data: CreateDishDto[]) {
    if (!data || data.length === 0) {
      throw new BadRequestException("Список блюд не может быть пустым");
    }

    for (const dish of data) {
      const ids = dish.recipeItems.map((item) => item.productId);
      if (new Set(ids).size !== ids.length || !ids.length) {
        throw new BadRequestException(
          `Добавьте ингредиенты без повторяющихся продуктов для блюда "${dish.name}"`,
        );
      }
    }

    const allProductIds = [
      ...new Set(
        data.flatMap((dish) => dish.recipeItems.map((item) => item.productId)),
      ),
    ];

    const count = await this.prisma.product.count({
      where: { id: { in: allProductIds }, isDeleted: false },
    });
    if (count !== allProductIds.length) {
      throw new BadRequestException(
        "Один или несколько продуктов не существуют или удалены",
      );
    }

    const stock = await this.fetchStock(allProductIds);

    try {
      const createdDishes = await this.prisma.$transaction(async (tx) => {
        return Promise.all(
          data.map((dishData) =>
            tx.dish.create({
              data: {
                name: dishData.name.trim(),
                description: dishData.description?.trim(),
                imageURL: dishData.imageURL?.trim(),
                salePrice: dishData.salePrice,
                category: dishData.category?.trim(),
                recipeItems: {
                  create: dishData.recipeItems.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                  })),
                },
              },
              include: {
                recipeItems: {
                  include: { product: { include: { unit: true } } },
                },
              },
            }),
          ),
        );
      });

      return this.enrichWithStock(createdDishes, stock);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Одно или несколько блюд с таким названием уже существуют",
        );
      }
      throw error;
    }
  }

  async findAll(search?: string) {
    const dishes = await this.prisma.dish.findMany({
      where: {
        isDeleted: false,
        name: search
          ? {
              contains: search,
              mode: "insensitive",
            }
          : undefined,
      },
      include: {
        recipeItems: {
          include: {
            product: {
              include: {
                unit: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
    return this.enrichWithStock(dishes);
  }

  async findOne(id: number) {
    const dish = await this.prisma.dish.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      include: {
        recipeItems: {
          include: {
            product: {
              include: {
                unit: true,
              },
            },
          },
        },
      },
    });

    if (!dish) {
      throw new NotFoundException(`Блюдо с ID ${id} не найдено`);
    }

    return (await this.enrichWithStock([dish]))[0];
  }

  private async fetchStock(productIds: number[]): Promise<any[]> {
    return productIds.length
      ? this.handleRpcResponse(
          await this.commandBusService.sendCommand(
            EXCHANGES.COMMANDS,
            ROUTING_KEYS.GET_INVENTORY_STOCK,
            { productIds },
          ),
        )
      : [];
  }

  private async enrichWithStock(dishes: any[], stockBatches?: any[]) {
    const productIds = [
      ...new Set<number>(
        dishes.flatMap((dish) =>
          dish.recipeItems.map((item: any) => item.productId),
        ),
      ),
    ];
    const batches = stockBatches ?? (await this.fetchStock(productIds));
    const byProduct = new Map<number, any[]>();
    for (const batch of batches) {
      const entries = byProduct.get(batch.productId) ?? [];
      entries.push(batch);
      byProduct.set(batch.productId, entries);
    }
    return dishes.map((dish) => {
      const recipeItems = dish.recipeItems.map((item: any) => {
        const rows = byProduct.get(item.productId) ?? [];
        const stock = rows.reduce(
          (sum, row) => sum + Number(row.availableQuantity),
          0,
        );
        const price =
          stock > 0 && rows.every((row) => row.price != null)
            ? Math.round(
                (rows.reduce(
                  (sum, row) =>
                    sum + Number(row.price) * Number(row.availableQuantity),
                  0,
                ) /
                  stock) *
                  1e6,
              ) / 1e6
            : null;
        const quantity = Number(item.quantity);
        return {
          ...item,
          quantity,
          stock,
          price,
          portions: quantity > 0 ? Math.floor(stock / quantity + 1e-9) : 0,
          expiresAt: rows.length
            ? rows.map((row) => row.expiresAt).sort()[0]
            : null,
        };
      });
      return {
        ...dish,
        category: dish.category ?? null,
        salePrice: dish.salePrice == null ? null : Number(dish.salePrice),
        recipeItems,
        availablePortions: recipeItems.length
          ? Math.min(...recipeItems.map((item) => item.portions))
          : 0,
        costPrice: recipeItems.some((item) => item.price == null)
          ? null
          : Math.round(
              recipeItems.reduce(
                (sum, item) => sum + item.quantity * item.price,
                0,
              ) * 100,
            ) / 100,
      };
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.dish.update({
      where: { id },
      data: {
        isDeleted: true,
      },
    });
  }
}
