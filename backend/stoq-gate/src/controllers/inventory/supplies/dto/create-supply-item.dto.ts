import { Type } from "class-transformer";
import { IsDate, IsInt, IsNumber, Min, IsPositive, Max } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateSupplyItemDto {
  @ApiProperty({
    description: "ID продукта",
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiProperty({
    description: "Количество",
    example: 0.5,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity!: number;

  @ApiProperty({ description: "Полная стоимость позиции в рублях", example: 300, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000000000)
  totalPrice!: number;

  @ApiProperty({
    description: "Дата окончания срока годности",
    example: "2026-10-19T10:00:00.000Z",
  })
  @Type(() => Date)
  @IsDate()
  expiresAt!: Date;
}
