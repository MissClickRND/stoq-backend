import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class StatisticsPeriodDto {
  @ApiPropertyOptional({ enum: [7, 14, 30], default: 14 })
  @Type(() => Number)
  @IsIn([7, 14, 30])
  days: number = 14;
}

export class DishStatisticsPeriodDto {
  @ApiPropertyOptional({ enum: [7], default: 7 })
  @Type(() => Number)
  @IsIn([7])
  days: number = 7;
}

export class StatisticsIdDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  id!: number;
}
