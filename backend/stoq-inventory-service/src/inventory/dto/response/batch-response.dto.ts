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
  initialQuantity: number;
  expiresAt: string;
  status: string;
  balance: BatchBalanceResponseDto | null;
}

export function mapBatchToDto(batch: any): BatchResponseDto {
  return {
    id: batch.id,
    supplyId: batch.supplyId,
    productId: batch.productId,
    initialQuantity: batch.initialQuantity.toNumber(), 
    expiresAt: batch.expiresAt.toISOString(),
    status: batch.status,
    balance: batch.balance 
      ? {
          availableQuantity: batch.balance.availableQuantity.toNumber(),
          reservedQuantity: batch.balance.reservedQuantity.toNumber(),
        } 
      : null,
  };
}

export function mapBatchesToDto(batches: any[]): BatchResponseDto[] {
  return batches.map(mapBatchToDto);
}