import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
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

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  async create(data: CreateDishDto) {
    try {
      const dish = await this.prisma.dish.create({
        data: {
          name: data.name.trim(),
          description: data.description?.trim(),
          imageURL: data.imageURL?.trim(),
          salePrice: data.salePrice,
        },
      });

      try {
        const payload = {
          dto: {
            dishId: dish.id,
            items: data.recipeItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        };

        const response = await this.commandBusService.sendCommand(
          EXCHANGES.COMMANDS,
          ROUTING_KEYS.CREATE_RECIPES,
          payload,
        );

        this.handleRpcResponse(response);
      } catch (rpcError) {
        await this.prisma.dish
          .delete({ where: { id: dish.id } })
          .catch((deleteErr) => {});

        throw rpcError;
      }

      return dish;
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

  async findAll(search?: string) {
    return this.prisma.dish.findMany({
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

    return dish;
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
