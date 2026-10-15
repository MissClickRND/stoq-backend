export class DeductStockItemDto {
  productId!: number;
  quantity!: number;
}

export class DeductStockDto {
  actor?: { id: number | null; name: string; role: string | null; source?: string };
  orderId!: string;
  idempotencyKey!: string;
  items!: DeductStockItemDto[];
}
