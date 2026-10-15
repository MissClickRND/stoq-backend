import { ApiPropertyOptional } from "@nestjs/swagger";
import {
    IsEmail,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

export class UpdateRestaurantDto {
    @ApiPropertyOptional({ example: 'Ресторан "Ромашка"' })
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({ example: "г. Москва, ул. Пушкина, д. 10" })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    address?: string;

    @ApiPropertyOptional({ example: "+71234567890" })
    @IsOptional()
    @Transform(({ value }) => typeof value === 'string' ? value.trim() || null : value)
    @IsString()
    @MaxLength(30)
    phone?: string | null;

    @ApiPropertyOptional({ example: "restaurant@example.com" })
    @IsOptional()
    @Transform(({ value }) =>
        typeof value === "string" ? value.toLowerCase().trim() || null : value,
    )
    @IsEmail()
    email?: string | null;
}
