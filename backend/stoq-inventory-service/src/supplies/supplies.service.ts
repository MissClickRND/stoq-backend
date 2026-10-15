import { restaurantId } from '../common/tenant/restaurant-context';
import {
  ConflictException,
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
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
import { randomUUID } from "node:crypto";

@Injectable()
export class SupplyService {
  private readonly logger = new Logger(SupplyService.name);
  constructor(
    private prisma: PrismaService,
    private readonly commandBusService: CommandBusService,
  ) {}

  async resetBusinessData(confirmation: string) {
    if (confirmation !== 'RESET' || (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_TOOLS !== 'true')) {
      throw new ForbiddenException('Сброс тестовых данных отключён');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const movements = await tx.stockMovement.deleteMany({ where: { restaurantId: restaurantId() }, });
      await tx.idempotencyKey.deleteMany({ where: { restaurantId: restaurantId() }, });
      await tx.batchBalance.deleteMany({ where: { batch: { restaurantId: restaurantId() } }, });
      const batches = await tx.batch.deleteMany({ where: { restaurantId: restaurantId() }, });
      await tx.supplyItem.deleteMany({ where: { supply: { restaurantId: restaurantId() } }, });
      const supplies = await tx.supply.deleteMany({ where: { restaurantId: restaurantId() }, });
      return { supplies: supplies.count, batches: batches.count, movements: movements.count };
    });
    await this.publishStockChanged('BUSINESS_RESET');
    return result;
  }

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
          data: { restaurantId: restaurantId(),
            supplyNumber: dto.supplyNumber.trim(),
            supplier: dto.supplier.trim(),
            totalPrice,
            receivedAt: dto.receivedAt ?? new Date(),
            status: dto.status ?? "RECEIVED",
          },
        });

        const items: any[] = [];
        for (const item of dto.items) {
          const expiresAt = new Date(item.expiresAt);

          const batch = (dto.status ?? "RECEIVED") === "RECEIVED" ? await tx.batch.create({
            data: { restaurantId: restaurantId(),
              supplyId: supply.id,
              productId: item.productId,
              initialQuantity: item.quantity,
              price: new Prisma.Decimal(item.totalPrice)
                .div(item.quantity)
                .toDecimalPlaces(6),
              expiresAt,
              status: "ACTIVE",
            },
          }) : null;

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

          if (batch) await tx.batchBalance.create({
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
      await this.publishStockChanged("SUPPLY_CREATED", {
        supplyId: result.id, productIds: [...new Set(dto.items.map((item) => item.productId))],
      });

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
        { ...payload, eventId: randomUUID(), reason, occurredAt: new Date().toISOString() },
      );
    } catch (err) {
      this.logger.error(`Ошибка публикации изменения склада: ${reason}`, err);
    }
  }

  async updateSupply(id: number, dto: CreateSupplyDto) {
    if (!Number.isSafeInteger(id) || id < 1 || !dto.supplyNumber?.trim() || !dto.supplier?.trim() ||
      !dto.items?.length || dto.items.some((item) => !Number.isSafeInteger(item.productId) || item.productId < 1 ||
        !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.totalPrice) || item.totalPrice < 0 ||
        item.totalPrice > 1e12 || Math.abs(item.totalPrice * 100 - Math.round(item.totalPrice * 100)) > 1e-6 ||
        !Number.isFinite(new Date(item.expiresAt).getTime())) ||
      (dto.status !== undefined && !['RECEIVED', 'CANCELLED', 'IN_TRANSIT'].includes(dto.status))) {
      throw new BadRequestException('Проверьте номер, поставщика, статус и позиции поставки');
    }
    const response: any = await this.commandBusService.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_PRODUCT,
      { ids: [...new Set(dto.items.map((item) => item.productId))] });
    if (!response?.success) throw new HttpException('Не удалось проверить продукты поставки', response?.error?.status ?? 503);
    const productsById = buildProductsByIdMap(response.data);
    if (dto.items.some((item) => !productsById.has(item.productId))) throw new BadRequestException('Один или несколько продуктов не существуют');

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const previous = await tx.supply.findUnique({ where: { restaurantId: restaurantId(),  id }, include: { items: { orderBy: { id: 'asc' } } } });
        if (!previous) throw new NotFoundException('Поставка не найдена');
        const status = dto.status ?? previous.status;
        const changedItems = previous.items.length !== dto.items.length || previous.items.some((item, index) => {
          const next = dto.items[index];
          return !next || item.productId !== next.productId || Number(item.quantity) !== next.quantity ||
            item.totalPrice == null || Number(item.totalPrice) !== next.totalPrice ||
            new Date(item.expiresAt).getTime() !== new Date(next.expiresAt).getTime();
        });
        const changeStock = previous.status !== status || changedItems;
        let reusableBatchIds: number[] | undefined;
        if (previous.status === 'RECEIVED' && changeStock) {
          const batches = await tx.batch.findMany({ where: { restaurantId: restaurantId(),  supplyId: id }, include: { balance: true }, orderBy: { id: 'asc' } });
          const movements = await tx.stockMovement.count({ where: { restaurantId: restaurantId(),  batchId: { in: batches.map((batch) => batch.id) } } });
          if (movements || batches.some((batch) => !batch.balance || Number(batch.balance.reservedQuantity) !== 0 ||
            Number(batch.balance.availableQuantity) !== Number(batch.initialQuantity))) {
            throw new ConflictException('Партии уже использованы или зарезервированы. Можно изменить реквизиты, но не состав и статус принятой поставки');
          }
          if (status === 'RECEIVED' && batches.length === dto.items.length && batches.every((batch, index) => batch.productId === dto.items[index].productId)) {
            reusableBatchIds = batches.map((batch) => batch.id);
          } else {
            await tx.batchBalance.deleteMany({ where: { batch: { restaurantId: restaurantId() },  batchId: { in: batches.map((batch) => batch.id) } } });
            await tx.batch.deleteMany({ where: { restaurantId: restaurantId(),  supplyId: id } });
          }
        }
        const supply = await tx.supply.update({ where: { restaurantId: restaurantId(),  id }, data: {
          supplyNumber: dto.supplyNumber.trim(), supplier: dto.supplier.trim(), status,
          receivedAt: dto.receivedAt ?? previous.receivedAt,
          totalPrice: dto.items.reduce((sum, item) => sum.plus(item.totalPrice), new Prisma.Decimal(0)),
        } });
        let items = previous.items;
        if (changedItems) {
          await tx.supplyItem.deleteMany({ where: { supply: { restaurantId: restaurantId() },  supplyId: id } });
          items = [];
          for (const item of dto.items) items.push(await tx.supplyItem.create({ data: {
            supplyId: id, productId: item.productId, quantity: item.quantity, totalPrice: item.totalPrice, expiresAt: new Date(item.expiresAt),
          } }));
        }
        if (status === 'RECEIVED' && (previous.status !== 'RECEIVED' || changedItems)) {
          for (const [index, item] of dto.items.entries()) {
            if (reusableBatchIds) {
              const batchId = reusableBatchIds[index];
              await tx.batch.update({ where: { restaurantId: restaurantId(),  id: batchId }, data: { initialQuantity: item.quantity,
                price: new Prisma.Decimal(item.totalPrice).div(item.quantity).toDecimalPlaces(6), expiresAt: new Date(item.expiresAt), status: 'ACTIVE' } });
              await tx.batchBalance.update({ where: { batch: { restaurantId: restaurantId() },  batchId }, data: { availableQuantity: item.quantity, updatedAt: new Date() } });
              continue;
            }
            const batch = await tx.batch.create({ data: { restaurantId: restaurantId(),  supplyId: id, productId: item.productId,
              initialQuantity: item.quantity, price: new Prisma.Decimal(item.totalPrice).div(item.quantity).toDecimalPlaces(6),
              expiresAt: new Date(item.expiresAt), status: 'ACTIVE' } });
            await tx.batchBalance.create({ data: { batchId: batch.id, availableQuantity: item.quantity, reservedQuantity: 0 } });
          }
        }
        return {
          response: mapSupplyWithItemsToDto({ ...supply, items }, productsById),
          productIds: [...new Set([...previous.items, ...dto.items].map((item) => item.productId))],
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      await this.publishStockChanged('SUPPLY_UPDATED', { supplyId: id, productIds: result.productIds });
      return result.response;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('Поставка с таким номером уже существует');
        if (error.code === 'P2034') throw new ConflictException('Остатки изменились во время сохранения. Повторите действие');
      }
      throw error;
    }
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
      where: { restaurantId: restaurantId(), AND: query
        ? {
            OR: [
              { supplyNumber: { contains: query, mode: "insensitive" } },
              { supplier: { contains: query, mode: "insensitive" } },
              { items: { some: { productId: { in: productIds } } } },
            ],
          }
        : {} },
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
      where: { restaurantId: restaurantId(),  id },
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
