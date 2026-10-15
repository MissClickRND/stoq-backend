import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { Role } from "@prisma/client";

const userRoles = [Role.MANAGER, Role.WAITER, Role.STOREKEEPER];

export class ApproveUserDto {
    @ApiProperty({
        enum: userRoles,
        example: Role.WAITER,
    })
    @IsIn(userRoles, {
        message: "Недопустимая роль сотрудника",
    })
    role!: Role;
}
