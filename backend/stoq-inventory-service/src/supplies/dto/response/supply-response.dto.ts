import { ProductResponseDto } from "./product-response.dto";

export interface SupplyResponseDto {
  id: number;
  supplyNumber: string;
  receivedAt: string;
  status: string;
}

export interface SupplyItemResponseDto {
  supplyItemId: number;
  quantity: number;
  expiresAt: string;
  product: ProductResponseDto | null;
}

export interface SupplyWithItemsResponseDto extends SupplyResponseDto {
  items: SupplyItemResponseDto[];
}

export interface SupplyItemEntityLike {
  id: number;
  productId: number;
  quantity: unknown;
  expiresAt: Date | string;
}

export interface SupplyEntityLike {
  id: number;
  supplyNumber: string;
  receivedAt: Date | string;
  status: string;
  items?: SupplyItemEntityLike[];
}

function normalizeQuantity(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as any).toNumber === "function"
  ) {
    return (value as any).toNumber();
  }

  return Number(String(value ?? 0));
}

function normalizeDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

export function mapSupplyToDto(supply: SupplyEntityLike): SupplyResponseDto {
  return {
    id: supply.id,
    supplyNumber: supply.supplyNumber,
    receivedAt: normalizeDate(supply.receivedAt),
    status: supply.status,
  };
}

export function mapSupplyItemToDto(
  item: SupplyItemEntityLike,
  product: ProductResponseDto | null,
): SupplyItemResponseDto {
  return {
    supplyItemId: item.id,
    quantity: normalizeQuantity(item.quantity),
    expiresAt: normalizeDate(item.expiresAt),
    product,
  };
}

export function mapSupplyWithItemsToDto(
  supply: SupplyEntityLike,
  productsById: Map<number, ProductResponseDto>,
): SupplyWithItemsResponseDto {
  return {
    ...mapSupplyToDto(supply),
    items: (supply.items ?? []).map((item) =>
      mapSupplyItemToDto(item, productsById.get(item.productId) ?? null),
    ),
  };
}

export function mapSupplyWithMatchedItemsToDto(
  supply: SupplyEntityLike,
  productsById: Map<number, ProductResponseDto>,
): SupplyWithItemsResponseDto {
  return {
    ...mapSupplyToDto(supply),
    items: (supply.items ?? [])
      .filter((item) => productsById.has(item.productId))
      .map((item) =>
        mapSupplyItemToDto(item, productsById.get(item.productId) ?? null),
      ),
  };
}

export function buildProductsByIdMap(
  products: ProductResponseDto[],
): Map<number, ProductResponseDto> {
  return new Map(products.map((product) => [product.id, product]));
}