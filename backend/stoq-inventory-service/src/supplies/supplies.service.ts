import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CreateSupplyDto } from "./dto/requests/create-supply.dto";
import { PrismaService } from "../prisma/prisma.service";
import { EXCHANGES, ROUTING_KEYS } from "../common/rabbitMQ/rabbitmq-topology";
import { CommandBusService } from "../common/rabbitMQ/command-bus.service";
import {
  buildProductsByIdMap,
  mapSupplyToDto,
  mapSupplyWithItemsToDto,
  mapSupplyWithMatchedItemsToDto,
  SupplyWithItemsResponseDto,
} from "./dto/response/supply-response.dto";
import { ProductResponseDto } from "./dto/response/product-response.dto";

@Injectable()
export class SupplyService {
  constructor(
    private prisma: PrismaService,
    private readonly commandBusService: CommandBusService,
  ) {}

  async createSupply(dto: CreateSupplyDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const supply = await tx.supply.create({
          data: {
            supplyNumber: dto.supplyNumber,
            receivedAt: dto.receivedAt ?? new Date(),
            status: "RECEIVED",
          },
        });

        for (const item of dto.items) {
          const expiresAt = new Date(item.expiresAt);

          const batch = await tx.batch.create({
            data: {
              supplyId: supply.id,
              productId: item.productId,
              initialQuantity: item.quantity,
              expiresAt,
              status: "ACTIVE",
            },
          });

          await tx.supplyItem.create({
            data: {
              supplyId: supply.id,
              productId: item.productId,
              quantity: item.quantity,
              expiresAt,
            },
          });

          await tx.batchBalance.create({
            data: {
              batchId: batch.id,
              availableQuantity: item.quantity,
              reservedQuantity: 0,
            },
          });
        }

        return mapSupplyToDto(supply);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Поставка с таким номером уже существует");
      }

      throw error;
    }
  }

  async findAll(search?: string): Promise<SupplyWithItemsResponseDto[]> {
    const productResponse = (await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_PRODUCT,
      { search: search?.trim() },
    )) as any;

    const products: ProductResponseDto[] = productResponse?.data ?? [];

    if (products.length === 0) return [];

    const productsById = buildProductsByIdMap(products);
    const productIds = Array.from(productsById.keys());

    const supplies = await this.prisma.supply.findMany({
      where: {
        items: {
          some: {
            productId: { in: productIds },
          },
        },
      },
      include: {
        items: {
          orderBy: { id: "asc" },
        },
      },
      orderBy: { receivedAt: "desc" },
    });

    if (supplies.length === 0) return [];

    return supplies.map((supply) =>
      mapSupplyWithMatchedItemsToDto(supply, productsById),
    );
  }

  async findOne(id: number): Promise<SupplyWithItemsResponseDto> {
    const supply = await this.prisma.supply.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { id: "asc" },
        },
      },
    });

    if (!supply) {
      throw new NotFoundException(`Поставка с ID ${id} не найдена`);
    }

    const productIds = Array.from(
      new Set(supply.items.map((item) => item.productId)),
    );

    let productsById = new Map<number, ProductResponseDto>();

    if (productIds.length > 0) {
      const productResponse = (await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_PRODUCT,
        { ids: productIds },
      )) as any;

      const products: ProductResponseDto[] = productResponse?.data ?? [];
      productsById = buildProductsByIdMap(products);
    }

    return mapSupplyWithItemsToDto(supply, productsById);
  }
}
