import { Type } from "class-transformer";
import { IsDate, IsInt, IsNumber, Min } from "class-validator";
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
  @Min(0)
  quantity!: number;

  @ApiProperty({
    description: "Дата окончания срока годности",
    example: "2026-10-19T10:00:00.000Z",
  })
  @Type(() => Date)
  @IsDate()
  expiresAt!: Date;
}