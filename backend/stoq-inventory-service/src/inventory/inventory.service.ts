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

  async findAll(): Promise<any[]> {
    const batches = await this.prisma.batch.findMany({
      where: {
        status: "ACTIVE",
        balance: { availableQuantity: { gt: 0 } },
      },
      include: { balance: true },
    });

    if (batches.length === 0) return [];

    const mappedBatches = mapBatchesToDto(batches);
    const productIds = Array.from(new Set(batches.map((b) => b.productId)));

    const productResponse = (await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_PRODUCT,
      { ids: productIds },
    )) as any;

    const productsByProductId = new Map<number, any>(
      (productResponse?.data ?? []).map((p: any) => [p.id, p]),
    );

    return mappedBatches.map((batchDto: any, index: number) => {
      const productId = batchDto.productId ?? batches[index]?.productId;
      return {
        ...batchDto,
        product: productId
          ? (productsByProductId.get(productId) ?? null)
          : null,
      };
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
    const balance = await this.prisma.batchBalance.findUnique({
      where: {
        batchId: dto.batchId,
      },
    });

    if (!balance) {
      throw new NotFoundException("Партия не найдена");
    }

    return this.prisma.batchBalance.update({
      where: {
        batchId: dto.batchId,
      },
      data: {
        availableQuantity: dto.quantity,
      },
    });
  }
}
