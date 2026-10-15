import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
export class ChangeStatusDto {
  @ApiProperty({ enum: ['completed', 'rejected'], description: 'Завершить или отклонить заказ' })
  @IsIn(['completed', 'rejected'])
  status!: 'completed' | 'rejected';
}
