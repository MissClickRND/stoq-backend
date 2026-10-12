import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/request/create-product.dto";
import { Prisma } from "@prisma/client";
import { CreateUnitDto } from "./dto/request/create-unit.dto";
import {
  mapProductToDto,
  ProductResponseDto,
} from "./dto/response/product-response.dto";

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(search?: string): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: {
        isDeleted: false,
        name: search ? { contains: search, mode: "insensitive" } : undefined,
      },
      include: { unit: true },
      orderBy: { name: "asc" },
    });

    return products.map(mapProductToDto);
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      include: {
        unit: true,
      },
    });

    if (!product) {
      throw new NotFoundException("Продукт не найден");
    }

    return mapProductToDto(product);
  }

  async create(data: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: {
          name: data.name,
          unitId: data.unitId,
        },
        include: { unit: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException(
            "Продукт с таким названием уже существует",
          );
        }

        if (error.code === "P2003") {
          throw new NotFoundException("Указанная единица измерения не найдена");
        }
      }

      throw error;
    }
  }

  async createMany(data: CreateProductDto[]) {
    const products: any[] = [];

    for (const item of data) {
      const product = await this.create(item);
      products.push(product);
    }

    return products;
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.product.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async createUnit(dto: CreateUnitDto) {
    try {
      return await this.prisma.unit.create({
        data: {
          name: dto.name,
          shortName: dto.shortName,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          (error.meta?.target as string[])?.join(", ") ?? "поле";
          throw new ConflictException("Такая единица измерения уже существует");
        }
      }
      throw error;
    }
  }

  async findAllUnits() {
    return this.prisma.unit.findMany({
      orderBy: { id: "asc" },
    });
  }

  async findOneUnit(id: number) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
    });

    if (!unit) {
      throw new NotFoundException(`Unit with id ${id} not found`);
    }

    return unit;
  }
}
