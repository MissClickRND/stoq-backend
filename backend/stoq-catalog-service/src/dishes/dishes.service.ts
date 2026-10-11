import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDishDto } from "./dto/create-dish.dto";

@Injectable()
export class DishesService {
    constructor(private readonly prisma: PrismaService) {}

    async create(data: CreateDishDto) {
        try {
            return await this.prisma.dish.create({
                data: {
                    name: data.name.trim(),
                },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                throw new ConflictException(
                    "Блюдо с таким названием уже существует",
                );
            }

            throw error;
        }
    }

    async findAll() {
        return this.prisma.dish.findMany({
            where: {
                isDeleted: false,
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
