import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsDate,
  ValidateNested,
  IsOptional,
  IsIn,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { CreateSupplyItemDto } from "./create-supply-item.dto";

export class CreateSupplyDto {
  @ApiPropertyOptional({ enum: ['RECEIVED', 'CANCELLED', 'IN_TRANSIT'], default: 'RECEIVED' })
  @IsOptional()
  @IsIn(['RECEIVED', 'CANCELLED', 'IN_TRANSIT'])
  status?: 'RECEIVED' | 'CANCELLED' | 'IN_TRANSIT';

  @ApiProperty({
    description: "Номер накладной поставки",
    example: "П-2026-0042",
  })
  @IsString()
  @IsNotEmpty()
  supplyNumber!: string;

  @ApiProperty({ description: "Название поставщика", example: "ООО Молочный двор" })
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  supplier!: string;

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
