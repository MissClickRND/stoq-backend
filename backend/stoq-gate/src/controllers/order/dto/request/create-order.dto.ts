import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsISO8601,
  IsIn,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderItemDto } from './order-item.dto';

export class CreateOrderDto {
  @ApiPropertyOptional({ description: 'Дата и время заказа в ISO 8601 с часовым поясом', format: 'date-time', example: '2026-10-13T12:30:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;

  @ApiPropertyOptional({ enum: ['dine-in', 'takeaway'], default: 'dine-in' })
  @IsOptional()
  @IsIn(['dine-in', 'takeaway'])
  type?: 'dine-in' | 'takeaway';

  @ApiPropertyOptional({ description: 'Номер стола, только для зала', minimum: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  table?: number | null;

  @ApiPropertyOptional({ description: 'Количество человек', minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  guests?: number;

  @ApiPropertyOptional({
    description: 'Блюда и их количество для добавления в заказ',
    type: [OrderItemDto],
    minItems: 1,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}
