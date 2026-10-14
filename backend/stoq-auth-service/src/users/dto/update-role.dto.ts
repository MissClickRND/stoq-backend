import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt } from 'class-validator';
import type { Role } from 'src/auth/types/auth-user.type';

export class UpdateRoleDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  userId: number;

  @ApiProperty({ example: 'COOK' })
  @IsIn(['ADMIN', 'WAITER', 'COOK', 'CUSTOMER'])
  role: Role;
}
