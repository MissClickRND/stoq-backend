import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/request/create-product.dto";
import { Prisma } from "@prisma/client";
import { CreateUnitDto } from "./dto/request/create-unit.dto";
import {
  mapProductToDto,
  ProductResponseDto,
} from "./dto/response/product-response.dto";
import { mapUnitToDto } from "./dto/response/unit-response.dto";
import { normalizeProductName, updUnit, validateUpdRows, UpdProductRow } from './upd-products';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUpdProducts(payload: { items: UpdProductRow[] }) {
    const rows = validateUpdRows(payload);
    return this.prisma.$transaction(async tx => {
      // Serialize scan imports so normalized names cannot be created twice concurrently.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(73120419)::text`;
      const products = await tx.product.findMany({ include: { unit: true } });
      const units = await tx.unit.findMany();
      const result: { productId: number; name: string; unit: ProductResponseDto['unit'];
        quantity: number | null; price: number | null; totalPrice: number | null }[] = [];
      for (const row of rows) {
        const name = row.name!.trim().replace(/\s+/g, ' ');
        const matches = products.filter(product => normalizeProductName(product.name) === normalizeProductName(name));
        if (matches.length > 1) throw new UnprocessableEntityException(`В каталоге несколько товаров «${name}». Уточните название`);
        let product = matches[0];
        if (product?.isDeleted) throw new UnprocessableEntityException(`Товар «${name}» удалён из каталога. Восстановите его перед сканированием`);
        const requestedUnit = updUnit(row.unit!);
        const matchingUnit = units.find(unit =>
          updUnit(unit.shortName).shortName === requestedUnit.shortName ||
          updUnit(unit.name).shortName === requestedUnit.shortName);
        if (product && updUnit(product.unit.shortName).shortName !== requestedUnit.shortName &&
          updUnit(product.unit.name).shortName !== requestedUnit.shortName) {
          throw new UnprocessableEntityException(`Единица измерения «${row.unit}» для «${name}» отличается от единицы в каталоге`);
        }
        let unit = product?.unit ?? matchingUnit;
        if (!unit) {
          unit = await tx.unit.upsert({ where: { shortName: requestedUnit.shortName },
            update: {}, create: { name: requestedUnit.name, shortName: requestedUnit.shortName } });
          units.push(unit);
        }
        if (!product) {
          product = await tx.product.create({ data: { name, unitId: unit.id }, include: { unit: true } });
          products.push(product);
        }
        result.push({ productId: product.id, name: product.name, unit: { id: unit.id, name: unit.name, shortName: unit.shortName },
          quantity: row.quantity, price: row.price, totalPrice: row.totalPrice });
      }
      return result;
    }, { maxWait: 5000, timeout: 25000 });
  }

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
      const product = await this.prisma.product.create({
        data: {
          name: data.name,
          unitId: data.unitId,
        },
        include: { unit: true },
      });
      return mapProductToDto(product);
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

    return products.map(mapProductToDto);
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
      const unit = await this.prisma.unit.create({
        data: {
          name: dto.name,
          shortName: dto.shortName,
        },
      });
      return mapUnitToDto(unit);
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
