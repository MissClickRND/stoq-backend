import {
  ConflictException,
  BadRequestException,
  HttpException,
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
  mapSupplyWithItemsToDto,
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
    if (
      !dto.supplier?.trim() ||
      !dto.supplyNumber?.trim() ||
      !dto.items?.length ||
      dto.items.some(
        (item) =>
          !Number.isFinite(item.quantity) ||
          item.quantity <= 0 ||
          !Number.isFinite(item.totalPrice) ||
          item.totalPrice < 0 ||
          item.totalPrice > 1e12 ||
          Math.abs(item.totalPrice * 100 - Math.round(item.totalPrice * 100)) >
            1e-6,
      )
    ) {
      throw new BadRequestException(
        "Укажите поставщика, позиции с положительным количеством и сумму от 0 ₽ (до 2 знаков)",
      );
    }

    const response: any = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_PRODUCT,
      { ids: [...new Set(dto.items.map((item) => item.productId))] },
    );

    if (!response?.success) {
      throw new HttpException(
        "Не удалось проверить продукты поставки",
        response?.error?.status ?? 503,
      );
    }

    const productsById = buildProductsByIdMap(response.data);
    if (dto.items.some((item) => !productsById.has(item.productId))) {
      throw new BadRequestException(
        "Один или несколько продуктов не существуют",
      );
    }

    const totalPrice = dto.items.reduce(
      (sum, item) => sum.plus(item.totalPrice),
      new Prisma.Decimal(0),
    );

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const supply = await tx.supply.create({
          data: {
            supplyNumber: dto.supplyNumber.trim(),
            supplier: dto.supplier.trim(),
            totalPrice,
            receivedAt: dto.receivedAt ?? new Date(),
            status: "RECEIVED",
          },
        });

        const items: any[] = [];
        for (const item of dto.items) {
          const expiresAt = new Date(item.expiresAt);

          const batch = await tx.batch.create({
            data: {
              supplyId: supply.id,
              productId: item.productId,
              initialQuantity: item.quantity,
              price: new Prisma.Decimal(item.totalPrice)
                .div(item.quantity)
                .toDecimalPlaces(6),
              expiresAt,
              status: "ACTIVE",
            },
          });

          items.push(
            await tx.supplyItem.create({
              data: {
                supplyId: supply.id,
                productId: item.productId,
                quantity: item.quantity,
                totalPrice: item.totalPrice,
                expiresAt,
              },
            }),
          );

          await tx.batchBalance.create({
            data: {
              batchId: batch.id,
              availableQuantity: item.quantity,
              reservedQuantity: 0,
            },
          });
        }

        return mapSupplyWithItemsToDto({ ...supply, items }, productsById);
      });

      // 4. 🚀 ПУБЛИКУЕМ СОБЫТИЕ ПОСЛЕ УСПЕШНОЙ ТРАНЗАКЦИИ
      // Используем тот же ROUTING_KEYS.STOCK_CHANGED, который слушает RecommendationEventsController
      await this.publishStockChanged("SUPPLY_CREATED", { supplyId: result.id });

      return result;
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

  private async publishStockChanged(reason: string, payload?: any) {
    try {
      await this.commandBusService.publishEvent(
        EXCHANGES.EVENTS,
        ROUTING_KEYS.STOCK_CHANGED,
        payload || reason,
      );
    } catch (err) {}
  }

  async findAll(search?: string): Promise<SupplyWithItemsResponseDto[]> {
    const productResponse = (await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_PRODUCT,
      {},
    )) as any;

    const products: ProductResponseDto[] = productResponse?.data ?? [];

    const productsById = buildProductsByIdMap(products);
    const query = search?.trim();
    const productIds = products
      .filter(
        (product) =>
          !query ||
          product.name
            .toLocaleLowerCase("ru-RU")
            .includes(query.toLocaleLowerCase("ru-RU")),
      )
      .map((product) => product.id);

    const supplies = await this.prisma.supply.findMany({
      where: query
        ? {
            OR: [
              { supplyNumber: { contains: query, mode: "insensitive" } },
              { supplier: { contains: query, mode: "insensitive" } },
              { items: { some: { productId: { in: productIds } } } },
            ],
          }
        : {},
      include: {
        items: {
          orderBy: { id: "asc" },
        },
      },
      orderBy: { receivedAt: "desc" },
    });

    if (supplies.length === 0) return [];

    return supplies.map((supply) =>
      mapSupplyWithItemsToDto(supply, productsById),
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
