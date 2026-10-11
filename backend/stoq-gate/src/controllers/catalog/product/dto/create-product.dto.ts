import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";

export class CreateProductDto {
  @ApiProperty({
    description: "Название продукта",
    example: "Молоко",
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) return trimmed;
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
    return value;
  })
  name!: string;

  @ApiProperty({
    description: "Идентификатор единицы измерения",
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  unitId!: number;
}
