import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateQuantityDto } from "./dto/update-quantity.dto";

@Injectable()
export class InventoryService {
    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.batchBalance.findMany({
            where: {
                availableQuantity: {
                    gt: 0,
                },
            },
            include: {
                batch: true,
            },
        });
    }

    async findOne(productId: number) {
        const batches = await this.prisma.batch.findMany({
            where: {
                productId,
                status: "ACTIVE",
            },
            include: {
                balance: true,
            },
        });

        if (batches.length === 0) {
            throw new NotFoundException(
                `Продукт с ID ${productId} не найден на складе`,
            );
        }

        return batches;
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
