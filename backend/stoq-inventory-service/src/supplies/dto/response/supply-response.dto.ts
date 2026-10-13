import { ProductResponseDto } from "./product-response.dto";

export interface SupplyResponseDto {
  id: number;
  supplyNumber: string;
  supplier: string | null;
  totalPrice: number | null;
  receivedAt: string;
  status: string;
}

export interface SupplyItemResponseDto {
  supplyItemId: number;
  id: number;
  productId: number;
  price: number | null;
  totalPrice: number | null;
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
  totalPrice?: unknown;
  expiresAt: Date | string;
}

export interface SupplyEntityLike {
  id: number;
  supplyNumber: string;
  supplier?: string | null;
  totalPrice?: unknown;
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
    supplier: supply.supplier ?? null,
    totalPrice: supply.totalPrice == null ? null : normalizeQuantity(supply.totalPrice),
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
    id: item.id,
    productId: item.productId,
    totalPrice: item.totalPrice == null ? null : normalizeQuantity(item.totalPrice),
    price: item.totalPrice == null || normalizeQuantity(item.quantity) <= 0 ? null :
      Math.round(normalizeQuantity(item.totalPrice) / normalizeQuantity(item.quantity) * 1e6) / 1e6,
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
