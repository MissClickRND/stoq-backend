import {
    IsEmail,
    IsString,
    IsNotEmpty,
    MinLength,
    MaxLength,
    Matches,
    IsOptional,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";

export class RegisterRestaurantDto {
    @ApiProperty({
        description: "Имя и фамилия администратора ресторана",
        example: "Петров Петр",
        minLength: 2,
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty({ message: "Имя и фамилия обязательны" })
    @MinLength(2)
    @MaxLength(100)
    fullName!: string;

    @ApiProperty({
        description: "Email администратора и ресторана",
        example: "owner@example.com",
        format: "email",
    })
    @IsEmail()
    @Transform(({ value }) => value.toLowerCase().trim())
    email!: string;

    @ApiProperty({
        description: "Пароль администратора",
        example: "Password666",
        format: "password",
        minLength: 4,
    })
    @IsString()
    @MinLength(4)
    password!: string;

    @ApiProperty({
        description: "Название ресторана",
        example: "Ромашка",
        minLength: 2,
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty({ message: "Название ресторана обязательно" })
    @MinLength(2)
    @MaxLength(100)
    restaurantName!: string;

    @ApiProperty({
        description: "Адрес ресторана",
        example: "г. Москва, ул. Пушкина, д. 10",
        required: false,
        maxLength: 200,
    })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    restaurantAddress?: string;
}
