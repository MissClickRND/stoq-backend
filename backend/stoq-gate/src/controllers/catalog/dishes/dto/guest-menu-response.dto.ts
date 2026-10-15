import { ApiProperty } from '@nestjs/swagger';

export class GuestMenuDishResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) category!: string | null;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, nullable: true }) imageURL!: string | null;
  @ApiProperty({ type: Number, nullable: true }) salePrice!: number | null;
  @ApiProperty() available!: boolean;
  @ApiProperty() recommended!: boolean;
  @ApiProperty({ type: Number, nullable: true, description: 'Порядок рекомендации, от 1 до 10' }) recommendationRank!: number | null;
}
