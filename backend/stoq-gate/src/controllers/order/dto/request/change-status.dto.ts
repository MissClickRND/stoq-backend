import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
export class ChangeStatusDto {
  @ApiProperty({ enum: ['completed'], description: 'Завершить заказ' })
  @IsIn(['completed'])
  status!: 'completed';
}
