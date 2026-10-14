import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email пользователя',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase().trim())
  email!: string;

  @ApiProperty({
    description: 'Пароль пользователя',
    example: 'SupePassword123',
    format: 'password',
  })
  @IsString()
  password!: string;
}
