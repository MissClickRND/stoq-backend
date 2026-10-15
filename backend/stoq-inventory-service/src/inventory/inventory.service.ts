import { restaurantId, restaurantStorage } from '../common/tenant/restaurant-context';
import {
  BadRequestException,
  ConflictException,
  HttpException,
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
type StockActor = { id: number | null; name: string; role: string | null; source?: string };

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  private readonly LOW_STOCK_THRESHOLD = 10;

  constructor(
    private prisma: PrismaService,
    private readonly commandBusService: CommandBusService,
  ) {}

  private async getCatalogProducts(): Promise<any[]> {
    const response: any = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.GET_PRODUCT, {},
    );
    if (!response?.success || !Array.isArray(response.data)) {
      throw new HttpException('Не удалось получить продукты', response?.error?.status ?? 503);
    }
    return response.data;
  }

  async getStatistics() {
    const products = await this.getCatalogProducts();
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const batches = await this.prisma.batch.findMany({
      where: { restaurantId: restaurantId() }, include: { balance: true },
    });
    const quantities = new Map<number, Decimal>();
    const expiring = new Set<number>();
    const expirationHistory = await this.prisma.stockMovement.findMany({
      where: { restaurantId: restaurantId(), OR: [
        { type: 'WRITE_OFF', orderId: 'SYSTEM_EXPIRATION' }, { type: 'SYSTEM_EXPIRATION' },
      ] }, select: { productId: true, batchId: true },
    });
    const disposed = new Set(batches.filter(b => b.disposedAt).map(b => b.id));
    const spoiled = new Set(expirationHistory.filter(movement => !disposed.has(movement.batchId)).map(movement => movement.productId));
    for (const batch of batches) {
      if (batch.disposedAt) continue;
      const quantity = batch.balance?.availableQuantity ?? new Decimal(0);
      if (batch.status === BatchStatus.EXPIRED ||
        (batch.expiresAt <= now && quantity.greaterThan(0) &&
          [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT].includes(batch.status as any))) spoiled.add(batch.productId);
      if (![BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT].includes(batch.status as any) ||
        batch.expiresAt <= now || !quantity.greaterThan(0)) continue;
      quantities.set(batch.productId, (quantities.get(batch.productId) ?? new Decimal(0)).plus(quantity));
      if (batch.expiresAt <= soon) expiring.add(batch.productId);
    }
    const currentProducts = products.filter(p => !p.deletedAt && !p.isDeleted);
    return {
      totalProducts: currentProducts.length,
      depletedProducts: currentProducts.filter(p => !(quantities.get(p.id)?.greaterThan(0))).length,
      expiringProducts: currentProducts.filter(p => expiring.has(p.id)).length,
      spoiledProducts: spoiled.size,
      lowStockProducts: currentProducts.filter(p => (quantities.get(p.id) ?? new Decimal(0)).lte(this.LOW_STOCK_THRESHOLD))
        .map(product => ({ product, quantity: Number(quantities.get(product.id) ?? 0) })),
    };
  }

  async getWriteOffs() {
    const now = new Date();
    const movements = await this.prisma.stockMovement.findMany({
      where: { restaurantId: restaurantId(), type: { in: ['WRITE_OFF', 'SYSTEM_EXPIRATION'] } },
      orderBy: { createdAt: 'asc' },
    });
    const automaticBatchIds = movements.filter(m => m.orderId === 'SYSTEM_EXPIRATION' || m.type === 'SYSTEM_EXPIRATION').map(m => m.batchId);
    const batches = await this.prisma.batch.findMany({
      where: { restaurantId: restaurantId(), disposedAt: null, OR: [
        { status: BatchStatus.EXPIRED },
        { expiresAt: { lte: now }, status: { in: [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT] }, balance: { availableQuantity: { gt: 0 } } },
        { id: { in: automaticBatchIds } },
      ] },
      include: { balance: true }, orderBy: [{ expiresAt: 'desc' }, { id: 'desc' }],
    });
    if (!batches.length) return [];
    const cancelled = await this.prisma.supply.findMany({
      where: { restaurantId: restaurantId(), id: { in: [...new Set(batches.map(b => b.supplyId))] }, status: 'CANCELLED' },
      select: { id: true },
    });
    const cancelledIds = new Set(cancelled.map(s => s.id));
    const products = await this.getCatalogProducts();
    const productsById = new Map(products.map(p => [p.id, p]));
    const automaticIds = new Set(automaticBatchIds);
    return batches.filter(b => !b.disposedAt && !cancelledIds.has(b.supplyId) && (
      b.status === BatchStatus.EXPIRED || automaticIds.has(b.id) ||
      (b.expiresAt <= now && [BatchStatus.ACTIVE, BatchStatus.RUNNINGOUT].includes(b.status as any) && Number(b.balance?.availableQuantity ?? 0) > 0)
    )).map(batch => {
      const history = movements.filter(m => m.batchId === batch.id && Number(m.quantity) < 0 &&
        (m.orderId === 'SYSTEM_EXPIRATION' || m.type === 'SYSTEM_EXPIRATION'));
      const quantity = history.reduce((sum, m) => sum.minus(m.quantity), new Decimal(0));
      const last = history.reduce<Date | null>((latest, m) => !latest || m.createdAt > latest ? m.createdAt : latest, null);
      return {
        batchId: batch.id, productId: batch.productId,
        product: productsById.get(batch.productId) ?? { id: batch.productId, name: `Продукт №${batch.productId}`, unit: null },
        writtenOffQuantity: history.length ? Number(quantity) : null,
        writtenOffAt: last?.toISOString() ?? null,
        expiresAt: batch.expiresAt.toISOString(), reason: 'EXPIRED' as const,
      };
    });
  }

  async disposeBatch(batchId: number) {
    if (!Number.isSafeInteger(batchId) || batchId < 1) throw new BadRequestException('Некорректный ID партии');
    return this.prisma.$transaction(async tx => {
      const batch = await tx.batch.findUnique({ where: { restaurantId: restaurantId(), id: batchId }, include: { balance: true } });
      if (!batch) throw new NotFoundException('Партия не найдена');
      if (batch.disposedAt) return { batchId, disposedAt: batch.disposedAt.toISOString(), alreadyDisposed: true };
      if (batch.status !== BatchStatus.EXPIRED || !batch.balance || !batch.balance.availableQuantity.isZero() || !batch.balance.reservedQuantity.isZero())
        throw new ConflictException('Сначала дождитесь автоматического списания просроченной партии');
      const disposedAt = new Date();
      const changed = await tx.batch.updateMany({ where: { restaurantId: restaurantId(), id: batchId,
        status: BatchStatus.EXPIRED, disposedAt: null, balance: { availableQuantity: 0, reservedQuantity: 0 } }, data: { disposedAt } });
      if (!changed.count) throw new ConflictException('Партия изменилась. Обновите список');
      return { batchId, disposedAt: disposedAt.toISOString(), alreadyDisposed: false };
    });
  }

  async getMovementHistory(afterId = 0) {
    if (!Number.isSafeInteger(afterId) || afterId < 0) throw new BadRequestException('Некорректный курсор движений');
    const rows = await this.prisma.stockMovement.findMany({ where: { restaurantId: restaurantId(), id: { gt: afterId }, quantity: { lt: 0 } }, orderBy: { id: 'asc' }, take: 101 });
    const products = rows.length ? await this.getCatalogProducts() : [];
    return { items: rows.slice(0, 100).map(row => ({ id: row.id, batchId: row.batchId, productId: row.productId,
      product: products.find(p => p.id === row.productId) ?? { id: row.productId, name: `Продукт №${row.productId}`, unit: null },
      orderId: row.orderId, type: row.type, quantity: Number(row.quantity), timestamp: row.createdAt.toISOString(),
      actor: { id: row.actorId ?? null, name: row.actorName ?? null, role: row.actorRole ?? null } })),
      hasMore: rows.length > 100 };
  }

  private actorFields(actor?: StockActor) {
    return { actorId: actor?.id ?? null, actorName: actor?.name ?? null,
      actorRole: actor?.role ?? (actor?.source === 'GUEST' ? 'GUEST' : actor?.source === 'SYSTEM' ? 'SYSTEM' : null) };
  }

  private validateInventoryItems(dto: UpdateQuantityDto) {
    if (!Array.isArray(dto?.items) || dto.items.length === 0 || dto.items.some(item =>
      !item || !Number.isSafeInteger(item.batchId) || item.batchId < 1 ||
      !Number.isFinite(item.quantity) || item.quantity < 0 ||
      (item.remove !== undefined && typeof item.remove !== 'boolean')) ||
      new Set(dto.items.map(item => item.batchId)).size !== dto.items.length ||
      (dto.includeReport !== undefined && typeof dto.includeReport !== 'boolean')) {
      throw new BadRequestException('Некорректные данные инвентаризации или повторяющиеся партии');
    }
  }

  private compareInventory(dto: UpdateQuantityDto, batches: { id: number; status: BatchStatus; expiresAt?: Date; balance?: { availableQuantity: Decimal } | null }[]) {
    const byId = new Map(batches.map(batch => [batch.id, batch]));
    const statistics = { checked: dto.items.length, updated: 0, deleted: 0, unchanged: 0 };
    for (const item of dto.items) {
      const batch = byId.get(item.batchId);
      if (!batch?.balance) throw new NotFoundException(`Партия не найдена: ${item.batchId}`);
      if (batch.status === BatchStatus.EXPIRED || (batch.expiresAt && batch.expiresAt <= new Date())) {
        throw new ConflictException('Просроченные партии доступны только для просмотра');
      }
      if (item.remove) statistics.deleted++;
      else if (batch.balance.availableQuantity.equals(item.quantity)) statistics.unchanged++;
      else statistics.updated++;
    }
    return statistics;
  }

  async preview(dto: UpdateQuantityDto) {
    this.validateInventoryItems(dto);
    const batches = await this.prisma.batch.findMany({
      where: { restaurantId: restaurantId(), id: { in: dto.items.map(item => item.batchId) } },
      include: { balance: true },
    });
    return this.compareInventory(dto, batches);
  }

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
        expiresAt: { gt: new Date() },
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
        expiresAt: { gt: new Date() },
        balance: { availableQuantity: { gt: 0 } },
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

  async updateQuantity(dto: UpdateQuantityDto, actor?: StockActor) {
    this.validateInventoryItems(dto);
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
        include: { balance: true },
      });

      const statistics = this.compareInventory(dto, batches);

      const statusMap = new Map(batches.map((b) => [b.id, b.status]));
      const updates: Promise<any>[] = [];

      for (const item of dto.items) {
        const newQty = new Decimal(item.remove ? 0 : item.quantity);
        const currentStatus = statusMap.get(item.batchId);
        const batch = batches.find(b => b.id === item.batchId)!;
        const delta = newQty.minus(batch.balance!.availableQuantity);
        if (!delta.isZero()) await tx.stockMovement.create({ data: { restaurantId: restaurantId(),
          orderId: 'INVENTORY_ADJUSTMENT', batchId: batch.id, productId: batch.productId, quantity: delta,
          type: 'INVENTORY_ADJUSTMENT', ...this.actorFields(actor) } });

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
        statistics,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.publish("MANUAL_UPDATE", { batchIds, productIds: result.productIds });

    return dto.includeReport
      ? { batches: result.updates, statistics: result.statistics, completedAt: new Date().toISOString() }
      : result.updates;
  }

  async writeOffBatch(batchId: number, actor?: StockActor) {
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
      const movement = await tx.stockMovement.create({
        data: { restaurantId: restaurantId(),
          ...this.actorFields(actor),
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
        movementId: movement.id,
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
            ...this.actorFields(dto.actor),
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
