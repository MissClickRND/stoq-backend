import { ApiProperty } from '@nestjs/swagger';
export class UnitResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() shortName!: string;
}
export class ProductResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ type: UnitResponseDto }) unit!: UnitResponseDto;
}
export class SupplyItemResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() supplyItemId!: number;
  @ApiProperty() productId!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: Number, nullable: true }) price!: number | null;
  @ApiProperty({ type: Number, nullable: true }) totalPrice!: number | null;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: ProductResponseDto, nullable: true }) product!: ProductResponseDto | null;
}
export class SupplyResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() supplyNumber!: string;
  @ApiProperty({ type: String, nullable: true }) supplier!: string | null;
  @ApiProperty({ type: Number, nullable: true }) totalPrice!: number | null;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) receivedAt!: string;
  @ApiProperty({ type: [SupplyItemResponseDto] }) items!: SupplyItemResponseDto[];
}
export class InventoryResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() supplyId!: number;
  @ApiProperty() productId!: number;
  @ApiProperty({ description: 'Доступный остаток партии' }) Quantity!: number;
  @ApiProperty() availableQuantity!: number;
  @ApiProperty({ type: Number, nullable: true }) price!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Стоимость текущего остатка партии' }) totalPrice!: number | null;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: ProductResponseDto }) product!: ProductResponseDto;
}
export class RecipeItemResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() dishId!: number;
  @ApiProperty() productId!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: ProductResponseDto }) product!: ProductResponseDto;
  @ApiProperty({ type: Number, nullable: true, description: 'Средневзвешенная цена пригодных остатков' }) price!: number | null;
  @ApiProperty() stock!: number;
  @ApiProperty() portions!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) expiresAt!: string | null;
}
export class DishResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) category!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageURL!: string | null;
  @ApiProperty({ type: Number, nullable: true }) salePrice!: number | null;
  @ApiProperty({ type: Number, nullable: true }) costPrice!: number | null;
  @ApiProperty() availablePortions!: number;
  @ApiProperty({ type: [RecipeItemResponseDto] }) recipeItems!: RecipeItemResponseDto[];
}
export class OrderItemResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() orderId!: number;
  @ApiProperty() dishId!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageURL!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Цена при добавлении позиции в заказ' }) price!: number | null;
  @ApiProperty({ type: Number, nullable: true }) totalPrice!: number | null;
}
export class OrderResponseDto {
  @ApiProperty({ type: 'object', nullable: true, properties: {
    id: { type: 'integer', nullable: true }, name: { type: 'string' },
    role: { type: 'string', nullable: true }, source: { type: 'string', enum: ['EMPLOYEE', 'GUEST', 'SYSTEM'] },
  } }) createdBy!: { id: number | null; name: string; role: string | null; source: string } | null;
  @ApiProperty() id!: number;
  @ApiProperty({ type: Number, nullable: true }) totalPrice!: number | null;
  @ApiProperty({ format: 'date-time' }) date!: string;
  @ApiProperty({ enum: ['dine-in', 'takeaway'] }) type!: string;
  @ApiProperty({ type: Number, nullable: true }) table!: number | null;
  @ApiProperty() guests!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
  @ApiProperty({ type: [OrderItemResponseDto] }) items!: OrderItemResponseDto[];
}
