import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CreateSupplyDto } from "./dto/create-supply.dto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SupplyService {
  constructor(private prisma: PrismaService) {}

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
          const expiresAt = new Date(supply.receivedAt);
          expiresAt.setDate(expiresAt.getDate() + item.shelfLifeDays);

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
              shelfLifeDays: item.shelfLifeDays,
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

        return supply;
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

  async findAll() {
    return this.prisma.supply.findMany({
      include: {
        items: {
          include: {},
        },
      },
      orderBy: {
        receivedAt: "desc",
      },
    });
  }

  async findOne(id: number) {
    const supply = await this.prisma.supply.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!supply) {
      throw new NotFoundException(`Поставка с ID ${id} не найдена`);
    }

    return supply;
  }
}
