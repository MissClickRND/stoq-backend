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
  Quantity: number;
  expiresAt: string;
  status: string;
}

export function mapBatchToDto(batch: any): BatchResponseDto {
  return {
    id: batch.id,
    supplyId: batch.supplyId,
    Quantity: batch.balance.availableQuantity.toNumber(), 
    expiresAt: batch.expiresAt.toISOString(),
    status: batch.status,
  };
}

export function mapBatchesToDto(batches: any[]): BatchResponseDto[] {
  return batches.map(mapBatchToDto);
}