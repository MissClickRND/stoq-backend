import { ProductResponseDto } from "./product-response.dto";

export interface BatchBalanceResponseDto {
  availableQuantity: number;
  reservedQuantity: number;
}

export interface BatchWithProductResponseDto extends BatchResponseDto {
  product: ProductResponseDto;
}
export interface BatchResponseDto {
  id: number;
  supplyId: number;
  productId: number;
  price: number | null;
  totalPrice: number | null;
  availableQuantity: number;
  Quantity: number;
  expiresAt: string;
  status: string;
}

export function mapBatchToDto(batch: any): BatchResponseDto {
  return {
    id: batch.id,
    supplyId: batch.supplyId,
    productId: batch.productId,
    price: batch.price == null ? null : Number(batch.price),
    totalPrice: batch.price == null ? null : Math.round(Number(batch.price) * Number(batch.balance.availableQuantity) * 100) / 100,
    availableQuantity: Number(batch.balance.availableQuantity),
    Quantity: batch.balance.availableQuantity.toNumber(), 
    expiresAt: batch.expiresAt.toISOString(),
    status: batch.status,
  };
}

export function mapBatchesToDto(batches: any[]): BatchResponseDto[] {
  return batches.map(mapBatchToDto);
}
