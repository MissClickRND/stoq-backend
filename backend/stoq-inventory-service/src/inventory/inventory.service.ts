import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateQuantityDto } from "./dto/request/update-quantity.dto";
import { CommandBusService } from "../common/rabbitMQ/command-bus.service";
import { EXCHANGES, ROUTING_KEYS } from "../common/rabbitMQ/rabbitmq-topology";
import { mapBatchesToDto } from "./dto/response/batch-response.dto";

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private readonly commandBusService: CommandBusService,
  ) {}

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
      where: {
        status: "ACTIVE",
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

  async findOne(productId: number): Promise<any[]> {
    const batches = await this.prisma.batch.findMany({
      where: { productId, status: "ACTIVE" },
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
      where: { batchId: { in: batchIds } },
      select: { batchId: true },
    });

    const existingIds = new Set(existingBalances.map((b) => b.batchId));
    const missingIds = batchIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      throw new NotFoundException(
        `Партии не найдены: ${missingIds.join(", ")}`,
      );
    }

    return this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.batchBalance.update({
          where: { batchId: item.batchId },
          data: { availableQuantity: item.quantity },
        }),
      ),
    );
  }
}
