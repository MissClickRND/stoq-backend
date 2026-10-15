import { ApiProperty } from '@nestjs/swagger';

class OrderErrorProductDto {
  @ApiProperty({ example: 7 }) productId!: number;
  @ApiProperty({ example: 'Молоко' }) name!: string;
}

export class OrderErrorDto {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ example: 'Недостаточно товаров на складе' }) message!: string;
  @ApiProperty({ type: [OrderErrorProductDto], description: 'Недостающие продукты' })
  products!: OrderErrorProductDto[];
}
