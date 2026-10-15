import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({
    description: 'Имя и фамилия сотрудника',
    example: 'Иванов Иван',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'Имя и фамилия обязательны' })
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({
    description: 'Рабочий email сотрудника',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email!: string;

  @ApiProperty({
    description: 'Пароль сотрудника',
    example: 'SupePassword123',
    format: 'password',
    minLength: 4,
  })
  @IsString()
  @MinLength(4)
  password!: string;

  @ApiProperty({
    description: 'ID ресторана, к которому привязывается сотрудник',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  restaurantId!: number;
}
