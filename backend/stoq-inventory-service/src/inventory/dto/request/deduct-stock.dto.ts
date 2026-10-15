export class DeductStockItemDto {
  productId!: number;
  quantity!: number;
}

export class DeductStockDto {
  orderId!: string;
  idempotencyKey!: string;
  items!: DeductStockItemDto[];
}
