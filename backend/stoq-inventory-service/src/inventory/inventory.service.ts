import { restaurantId, restaurantStorage } from '../common/tenant/restaurant-context';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateQuantityDto } from "./dto/request/update-quantity.dto";
import { CommandBusService } from "../common/rabbitMQ/command-bus.service";
import { EXCHANGES, ROUTING_KEYS } from "../common/rabbitMQ/rabbitmq-topology";
import { mapBatchesToDto } from "./dto/response/batch-response.dto";
import {
  DeductStockDto,
  DeductStockItemDto,
} from "./dto/request/deduct-stock.dto";
import { BatchStatus, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/client";
import { randomUUID } from "node:crypto";

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  private readonly LOW_STOCK_THRESHOLD = 10;

  constructor(
    private prisma: PrismaService,
    private readonly commandBusService: CommandBusService,
  ) {}

  private getBatchStatusByQuantity(
    quantity: Decimal,
    currentStatus?: BatchStatus,
  ): BatchStatus {
    if (quantity.isZero()) {
      return BatchStatus.DEPLETED;
    }
    if (quantity.lessThanOrEqualTo(this.LOW_STOCK_THRESHOLD)) {
      return BatchStatus.RUNNINGOUT;
    }
    return BatchStatus.ACTIVE;
  }

  async findAll(search?: string): Promise<any[]> {
    const productResponse = (await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_PRODUCT,
      {
        search: search?.trim(),
      },
    )) as any;

    const products: any[] = productResponse?.data ?? [];

    if (products.length === 0) return [];

    const productIds = products.map((p) => p.id);

    const batches = await this.prisma.batch.findMany({
      where: { restaurantId: restaurantId(),
        status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] },
        productId: { in: productIds },
        balance: { availableQuantity: { gt: 0 } },
      },
      include: { balance: true },
    });

    if (batches.length === 0) return [];

    const mappedBatches = mapBatchesToDto(batches);

    const batchesByProductId = new Map<number, any[]>();

    batches.forEach((batch, index) => {
      const batchDto = mappedBatches[index];

      if (!batch.productId) return;
      if (!batchDto) return;

      const batchWithProductId = {
        ...batchDto,
        productId: batch.productId,
      };

      const existing = batchesByProductId.get(batch.productId) ?? [];
      existing.push(batchWithProductId);
      batchesByProductId.set(batch.productId, existing);
    });

    return products.flatMap((product) => {
      const productBatches = batchesByProductId.get(product.id) ?? [];

      return productBatches.map((batchDto) => ({
        ...batchDto,
        product,
      }));
    });
  }

  async getStock(productIds: number[]) {
    if (
      !Array.isArray(productIds) ||
      productIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      throw new NotFoundException("Некорректные идентификаторы продуктов");
    }

    const uniqueProductIds = [...new Set(productIds)];

    const batches = await this.prisma.batch.findMany({
      where: { restaurantId: restaurantId(),
        productId: { in: uniqueProductIds },
        status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] },
        expiresAt: { gt: new Date() },
        balance: { availableQuantity: { gt: 0 } },
      },
      include: { balance: true },
    });

    if (batches.length === 0) return [];

    const batchProductIds = [...new Set(batches.map((b) => b.productId))];

    const productResponses = await Promise.all(
      batchProductIds.map((id) =>
        this.commandBusService.sendCommand(
          EXCHANGES.COMMANDS,
          ROUTING_KEYS.GET_PRODUCT_BY_ID,
          { id },
        ),
      ),
    );

    const productsMap = new Map<number, any>();
    productResponses.forEach((res: any, index) => {
      if (res?.data) {
        productsMap.set(batchProductIds[index], res.data);
      }
    });

    return batches.map((batch) => ({
      productId: batch.productId,
      product: productsMap.get(batch.productId) || null,
      availableQuantity: Number(batch.balance?.availableQuantity ?? 0),
      price: batch.price == null ? null : Number(batch.price),
      expiresAt: batch.expiresAt.toISOString(),
    }));
  }

  async findOne(productId: number): Promise<any[]> {
    const batches = await this.prisma.batch.findMany({
      where: { restaurantId: restaurantId(),
        productId,
        status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] },
      },
      include: { balance: true },
    });

    if (batches.length === 0) {
      throw new NotFoundException(
        `Продукт с ID ${productId} не найден на складе`,
      );
    }

    const mappedBatches = mapBatchesToDto(batches);

    const payload = { productId };
    const productResponse = (await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_PRODUCT_BY_ID,
      payload,
    )) as any;

    const enrichedBatches = mappedBatches.map((batch) => ({
      ...batch,
      product: productResponse.data,
    }));

    return enrichedBatches;
  }

  async updateQuantity(dto: UpdateQuantityDto) {
    const batchIds = dto.items.map((item) => item.batchId);

    const existingBalances = await this.prisma.batchBalance.findMany({
      where: { batch: { restaurantId: restaurantId() },  batchId: { in: batchIds } },
      select: { batchId: true },
    });

    const existingIds = new Set(existingBalances.map((b) => b.batchId));
    const missingIds = batchIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      throw new NotFoundException(
        `Партии не найдены: ${missingIds.join(", ")}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const batches = await tx.batch.findMany({
        where: { restaurantId: restaurantId(),  id: { in: batchIds } },
        select: { id: true, status: true, productId: true },
      });

      const statusMap = new Map(batches.map((b) => [b.id, b.status]));
      const updates: Promise<any>[] = [];

      for (const item of dto.items) {
        const newQty = new Decimal(item.quantity);
        const currentStatus = statusMap.get(item.batchId);

        updates.push(
          tx.batchBalance.update({
            where: { batch: { restaurantId: restaurantId() },  batchId: item.batchId },
            data: { availableQuantity: newQty },
          }),
        );

        if (currentStatus !== BatchStatus.EXPIRED) {
          const newStatus = this.getBatchStatusByQuantity(newQty);

          if (newStatus !== currentStatus) {
            updates.push(
              tx.batch.update({
                where: { restaurantId: restaurantId(),  id: item.batchId },
                data: { status: newStatus },
              }),
            );
          }
        }
      }

      return {
        updates: await Promise.all(updates),
        productIds: [...new Set(batches.map((batch) => batch.productId))],
      };
    });

    await this.publish("MANUAL_UPDATE", { batchIds, productIds: result.productIds });

    return result.updates;
  }

  async writeOffBatch(batchId: number) {
    if (!Number.isSafeInteger(batchId) || batchId < 1)
      throw new BadRequestException("Некорректный ID партии");
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { restaurantId: restaurantId(),  id: batchId },
        include: { balance: true },
      });
      if (!batch?.balance) throw new NotFoundException("Партия не найдена");
      if (Number(batch.balance.reservedQuantity) > 0)
        throw new ConflictException(
          "Партия зарезервирована. Завершите связанные заказы перед списанием",
        );
      const quantity = batch.balance.availableQuantity;
      if (quantity.isZero())
        return { batchId, productId: batch.productId, availableQuantity: 0, writtenOffQuantity: 0 };
      const updated = await tx.batchBalance.updateMany({
        where: { batch: { restaurantId: restaurantId() },  batchId, availableQuantity: quantity, reservedQuantity: 0 },
        data: { availableQuantity: 0, updatedAt: new Date() },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          "Остаток изменился. Обновите страницу и повторите списание",
        );
      if (batch.status !== BatchStatus.EXPIRED)
        await tx.batch.update({
          where: { restaurantId: restaurantId(),  id: batchId },
          data: { status: BatchStatus.DEPLETED },
        });
      await tx.stockMovement.create({
        data: { restaurantId: restaurantId(),
          orderId: "manual-write-off",
          batchId,
          productId: batch.productId,
          quantity: quantity.neg(),
          type: "WRITE_OFF",
        },
      });
      return {
        batchId,
        productId: batch.productId,
        availableQuantity: 0,
        writtenOffQuantity: Number(quantity),
      };
    });
    const { productId, ...response } = result;
    if (result.writtenOffQuantity > 0) await this.publish("MANUAL_WRITE_OFF", {
      batchIds: [batchId], productIds: [productId],
    });
    return response;
  }

  async checkStockAvailability(
    items: DeductStockItemDto[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const now = new Date();

    const shortages: {
      productId: number;
      requested: string;
      available: string;
    }[] = [];

    for (const item of items) {
      const requestedQty = new Decimal(item.quantity);

      const batches = await client.batch.findMany({
        where: { restaurantId: restaurantId(),
          productId: item.productId,
          status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] },
          expiresAt: { gt: now },
          balance: { availableQuantity: { gt: new Decimal(0) } },
        },
        include: { balance: true },
        orderBy: { expiresAt: "asc" },
      });

      if (batches.length > 0) {
      }

      const totalAvailable = batches.reduce(
        (sum, batch) => sum.add(batch.balance!.availableQuantity),
        new Decimal(0),
      );

      if (totalAvailable.lessThan(requestedQty)) {
        shortages.push({
          productId: item.productId,
          requested: requestedQty.toString(),
          available: totalAvailable.toString(),
        });
      }
    }

    if (shortages.length > 0) {
      const errorDetails = shortages
        .map(
          (s) =>
            `Товар ID ${s.productId}: нужно ${s.requested}, доступно ${s.available}`,
        )
        .join("; ");

      const products = await Promise.all(
        [...new Set(shortages.map(({ productId }) => productId))].map(async (productId) => {
          let name = `Товар ID ${productId}`;
          try {
            const response: any = await this.commandBusService.sendCommand(
              EXCHANGES.COMMANDS,
              ROUTING_KEYS.GET_PRODUCT_BY_ID,
              { id: productId },
            );
            if (response?.success && typeof response.data?.name === "string" && response.data.name.trim()) {
              name = response.data.name;
            }
          } catch {
            // Preserve the stock error even when the catalog is unavailable.
          }
          return { productId, name };
        }),
      );
      throw new BadRequestException({
        statusCode: 400,
        message: `Недостаточно товаров на складе. ${errorDetails}`,
        products,
      });
    }
  }

  async deductStock(dto: DeductStockDto) {
    dto = { ...dto, idempotencyKey: `${restaurantId()}:${dto.idempotencyKey}` };
    const existingKey = await this.prisma.idempotencyKey.findUnique({
      where: { restaurantId: restaurantId(),  key: dto.idempotencyKey },
    });

    if (existingKey) {
      if (existingKey.orderId !== dto.orderId) {
        throw new ConflictException(
          "Idempotency key already used for a different order",
        );
      }
      return { success: true, message: "Already processed" };
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Claim the idempotency key inside the same transaction as all balances.
      await tx.idempotencyKey.create({
        data: { restaurantId: restaurantId(), key: dto.idempotencyKey, orderId: dto.orderId },
      });
      await this.checkStockAvailability(dto.items, tx);

      const movementsToCreate: Prisma.StockMovementCreateManyInput[] = [];

      for (const item of dto.items) {
        let remainingToDeduct = new Decimal(item.quantity);

        const batches = await tx.batch.findMany({
          where: { restaurantId: restaurantId(),
            productId: item.productId,
            status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] },
            expiresAt: { gt: now },
            balance: { availableQuantity: { gt: new Decimal(0) } },
          },
          include: { balance: true },
          orderBy: { expiresAt: "asc" },
        });

        for (const batch of batches) {
          if (remainingToDeduct.isZero()) break;

          const available = batch.balance!.availableQuantity;
          const deductAmount = available.lessThan(remainingToDeduct)
            ? available
            : remainingToDeduct;

          const newAvailable = available.minus(deductAmount);
          const newStatus = this.getBatchStatusByQuantity(
            newAvailable,
            batch.status,
          );

          const claimed = await tx.batchBalance.updateMany({
            where: { batch: { restaurantId: restaurantId() }, batchId: batch.id,
              availableQuantity: available },
            data: {
              availableQuantity: { decrement: deductAmount },
              updatedAt: now,
            },
          });
          if (claimed.count !== 1) {
            throw new ConflictException('Остаток уже занят другим заказом. Обновите доступность блюд');
          }

          if (newStatus !== batch.status) {
            await tx.batch.update({
              where: { restaurantId: restaurantId(),  id: batch.id },
              data: { status: newStatus },
            });
          }

          movementsToCreate.push({
            orderId: dto.orderId,
            batchId: batch.id,
            productId: item.productId,
            quantity: deductAmount.neg(),
            type: "DEDUCTION",
            createdAt: now,
          });

          remainingToDeduct = remainingToDeduct.minus(deductAmount);
        }
        if (!remainingToDeduct.isZero()) {
          throw new ConflictException('Остаток уже занят другим заказом. Обновите доступность блюд');
        }
      }

      if (movementsToCreate.length > 0) {
        await tx.stockMovement.createMany({ data: movementsToCreate.map(item => ({ ...item, restaurantId: restaurantId() })) });
      }

      return { success: true };
    }).catch(async (error) => {
      if (error?.code === 'P2002') {
        const processed = await this.prisma.idempotencyKey.findUnique({
          where: { restaurantId: restaurantId(), key: dto.idempotencyKey },
        });
        if (processed?.orderId === dto.orderId) return { success: true };
        if (processed) throw new ConflictException('Idempotency key already used for a different order');
      }
      throw error;
    });

    if (result.success) {
      await this.publish("ORDER_DEDUCTION", {
        productIds: [...new Set(dto.items.map((item) => item.productId))],
      });
    }

    return result;
  }

  async getExpiringSoonBatches(daysThreshold: number = 7) {
    if (!Number.isSafeInteger(daysThreshold) || daysThreshold < 0) {
      throw new BadRequestException("Некорректный порог срока годности");
    }
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
    if (!Number.isFinite(thresholdDate.getTime())) {
      throw new BadRequestException("Некорректный порог срока годности");
    }

    const batches = await this.prisma.batch.findMany({
      where: { restaurantId: restaurantId(),
        status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] },
        expiresAt: {
          gt: now,
          lte: thresholdDate,
        },
        balance: { availableQuantity: { gt: new Decimal(0) } },
      },
      include: {
        balance: true,
      },
      orderBy: {
        expiresAt: "asc",
      },
    });

    if (batches.length === 0) return [];

    const batchProductIds = [...new Set(batches.map((b) => b.productId))];

    const productResponses = await Promise.all(
      batchProductIds.map((id) =>
        this.commandBusService.sendCommand(
          EXCHANGES.COMMANDS,
          ROUTING_KEYS.GET_PRODUCT_BY_ID,
          { id: id },
        ),
      ),
    );

    const productsMap = new Map<number, any>();
    productResponses.forEach((res: any, index) => {
      if (res?.data) {
        productsMap.set(batchProductIds[index], res.data);
      }
    });

    return batches.map((batch) => {
      const diffTime = batch.expiresAt.getTime() - now.getTime();

      const daysRemaining = Math.max(
        0,
        Math.floor(diffTime / (1000 * 60 * 60 * 24)),
      );

      return {
        batchId: batch.id,
        productId: batch.productId,
        product: productsMap.get(batch.productId) || null,
        expiresAt: batch.expiresAt,
        daysRemaining,
        availableQuantity: batch.balance!.availableQuantity.toString(),
        price: batch.price?.toString() || null,
      };
    });
  }

  async processJustExpiredBatches(): Promise<void> {
    const now = new Date();

    const expiredBatches = await this.prisma.batch.findMany({
      where: { restaurantId: restaurantId(),
        status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] },
        expiresAt: { lte: now },
        balance: { availableQuantity: { gt: new Decimal(0) } },
      },
      include: { balance: true },
    });

    if (expiredBatches.length === 0) {
      return;
    }

    for (const batch of expiredBatches) {
      try {
        await this.handleSingleBatchExpiration(batch, now);
      } catch (error) {
        this.logger.error(`Ошибка при обработке партии ID ${batch.id}`, error);
      }
    }
  }

  async processExpiredForAllRestaurants(): Promise<void> {
    const restaurants = await this.prisma.batch.findMany({
      where: { restaurantId: { not: null }, expiresAt: { lte: new Date() }, status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] } },
      distinct: ['restaurantId'], select: { restaurantId: true },
    });
    for (const row of restaurants) await restaurantStorage.run(row.restaurantId!, () => this.processJustExpiredBatches());
  }

  private async handleSingleBatchExpiration(batch: any, now: Date) {
    const notification = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.batch.updateMany({
        where: { restaurantId: restaurantId(),
          id: batch.id,
          status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] },
          // A supply edit may have extended the lifetime since the scan.
          expiresAt: { equals: batch.expiresAt, lte: now },
          productId: batch.productId,
          balance: { availableQuantity: { gt: new Decimal(0) } },
        },
        data: {
          status: BatchStatus.EXPIRED,
        },
      });

      if (updated.count === 0) {
        return null;
      }

      // Read the balance inside the transaction, after claiming the batch.
      const balance = await tx.batchBalance.findUniqueOrThrow({
        where: { batch: { restaurantId: restaurantId() },  batchId: batch.id },
      });
      const lostQuantity = balance.availableQuantity;

      await tx.batchBalance.update({
        where: { batch: { restaurantId: restaurantId() },  batchId: batch.id },
        data: {
          availableQuantity: new Decimal(0),
          updatedAt: now,
        },
      });

      await tx.stockMovement.create({
        data: { restaurantId: restaurantId(),
          orderId: "SYSTEM_EXPIRATION",
          batchId: batch.id,
          productId: batch.productId,
          quantity: lostQuantity.neg(),
          type: "WRITE_OFF",
          createdAt: now,
        },
      });

      return {
        eventId: randomUUID(),
        occurredAt: now.toISOString(),
        batchId: batch.id,
        productId: batch.productId,
        lostQuantity: lostQuantity.toString(),
        expiredAt: batch.expiresAt.toISOString(),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!notification) return;
    // Neither event may reach clients until the write-off has committed.
    // Try both publications even if one of them fails.
    const results = await Promise.allSettled([
      this.publishBatchExpiredNotification(notification),
      this.publish("EXPIRATION_WRITE_OFF", {
        batchIds: [batch.id],
        productIds: [batch.productId],
      }),
    ]);
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
  }

  private async publish(reason: string, details: { batchIds?: number[]; productIds?: number[] } = {}) {
    try {
      await this.commandBusService.publishEvent(
        EXCHANGES.EVENTS,
        ROUTING_KEYS.STOCK_CHANGED,
        { eventId: randomUUID(), reason, occurredAt: new Date().toISOString(), ...details },
      );
    } catch (err) {
      this.logger.error(`ОШИБКА при публикации события ${reason}`, err);
      throw err;
    }
  }

  private async publishBatchExpiredNotification(payload: {
    batchId: number;
    productId: number;
    lostQuantity: string;
    expiredAt: string;
    eventId: string;
    occurredAt: string;
  }) {
    try {
      await this.commandBusService.publishEvent(
        EXCHANGES.EVENTS,
        ROUTING_KEYS.BATCH_EXPIRED,
        payload,
      );
    } catch (err) {
      this.logger.error(
        `Ошибка при публикации уведомления о просрочке (Batch ID: ${payload.batchId})`,
        err,
      );
      throw err;
    }
  }
}
