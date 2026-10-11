import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateDishDto {
    @ApiProperty({
        description: "Название блюда",
        example: "Омлет",
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    @Transform(({ value }) => {
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed.length === 0) return trimmed;
            return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
        }
        return value;
    })
    name!: string;
}
