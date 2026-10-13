import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsDate,
  ValidateNested,
  IsOptional,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { CreateSupplyItemDto } from "./create-supply-item.dto";

export class CreateSupplyDto {
  @ApiProperty({
    description: "Номер накладной поставки",
    example: "П-2026-0042",
  })
  @IsString()
  @IsNotEmpty()
  supplyNumber!: string;

  @ApiProperty({
    description: "Позиции поставки",
    type: [CreateSupplyItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSupplyItemDto)
  items!: CreateSupplyItemDto[];

  @ApiPropertyOptional({
    description: "Дата получения (по умолчанию - сейчас)",
    example: "2026-10-12T10:00:00Z",
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedAt?: Date;
}
