import {
    ConflictException,
    Injectable,
    NotFoundException,
    BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRecipeDto } from "./dto/create-recipe.dto";
import { AddRecipeItemsDto } from "./dto/add-recipe-item.dto";


@Injectable()
export class RecipesService {
    constructor(private readonly prisma: PrismaService) {}

    private async ensureDishExists(dishId: number) {
        const dish = await this.prisma.dish.findFirst({
            where: {
                id: dishId,
                isDeleted: false,
            },
        });

        if (!dish) {
            throw new NotFoundException(`Блюдо с ID ${dishId} не найдено`);
        }
    }

    private async ensureProductsExist(
        items: { productId: number; quantity: number }[],
    ) {
        const productIds = items.map((item) => item.productId);

        if (new Set(productIds).size !== productIds.length) {
            throw new BadRequestException(
                "В списке не должно быть повторяющихся продуктов",
            );
        }

        const products = await this.prisma.product.findMany({
            where: {
                id: { in: productIds },
                isDeleted: false,
            },
            select: {
                id: true,
            },
        });

        if (products.length !== productIds.length) {
            throw new BadRequestException(
                "Один или несколько продуктов не существуют или удалены",
            );
        }
    }

    async findAll() {
        return this.prisma.dish.findMany({
            where: {
                isDeleted: false,
                recipeItems: {
                    some: {},
                },
            },
            include: {
                recipeItems: {
                    include: {
                        product: {
                            include: {
                                unit: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                name: "asc",
            },
        });
    }

    async findOne(dishId: number) {
        const dish = await this.prisma.dish.findFirst({
            where: {
                id: dishId,
                isDeleted: false,
            },
            include: {
                recipeItems: {
                    include: {
                        product: {
                            include: {
                                unit: true,
                            },
                        },
                    },
                },
            },
        });

        if (!dish) {
            throw new NotFoundException(`Блюдо с ID ${dishId} не найдено`);
        }

        return dish;
    }

    async create(data: CreateRecipeDto) {
        await this.ensureDishExists(data.dishId);
        await this.ensureProductsExist(data.items);

        const existingItems = await this.prisma.recipeItem.count({
            where: { dishId: data.dishId },
        });

        if (existingItems > 0) {
            throw new ConflictException(
                "У этого блюда уже есть состав рецепта",
            );
        }

        return this.prisma
            .$transaction(
                data.items.map((item) =>
                    this.prisma.recipeItem.create({
                        data: {
                            dishId: data.dishId,
                            productId: item.productId,
                            quantity: item.quantity,
                        },
                    }),
                ),
            )
            .then(() => this.findOne(data.dishId));
    }

    async addItems(dishId: number, data: AddRecipeItemsDto) {
        await this.ensureDishExists(dishId);
        await this.ensureProductsExist(data.items);

        const existingItems = await this.prisma.recipeItem.findMany({
            where: { dishId },
            select: { productId: true },
        });

        const existingProductIds = new Set(
            existingItems.map((item) => item.productId),
        );

        if (data.items.some((item) => existingProductIds.has(item.productId))) {
            throw new ConflictException(
                "Один или несколько продуктов уже есть в рецепте",
            );
        }

        await this.prisma.$transaction(
            data.items.map((item) =>
                this.prisma.recipeItem.create({
                    data: {
                        dishId,
                        productId: item.productId,
                        quantity: item.quantity,
                    },
                }),
            ),
        );

        return this.findOne(dishId);
    }

    async remove(dishId: number) {
        await this.ensureDishExists(dishId);

        const result = await this.prisma.recipeItem.deleteMany({
            where: { dishId },
        });

        if (result.count === 0) {
            throw new NotFoundException("У этого блюда нет состава рецепта");
        }

        return {
            message: "Состав рецепта удалён",
            dishId,
        };
    }
}
