import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import { Role } from '../auth.types';

export const ACTIVE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.WAITER, Role.STOREKEEPER];

export class SetUserRoleDto {
  @ApiProperty({ enum: ACTIVE_ROLES })
  @IsIn(ACTIVE_ROLES)
  role!: Role;
}

export class SetUserBlockDto {
  @ApiProperty()
  @IsBoolean()
  blocked!: boolean;
}

export class CreateInvitationDto extends SetUserRoleDto {
  @ApiProperty({ minimum: 1, maximum: 720 })
  @IsInt()
  @Min(1)
  @Max(720)
  hours!: number;
}
