import { Type } from "class-transformer";
import { IsInt, IsNumber, Min } from "class-validator";
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
    description: "Срок годности в днях",
    example: 7,
  })
  @IsInt()
  @Min(1)
  shelfLifeDays!: number;
}
