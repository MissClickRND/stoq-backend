import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";

export class CreateUnitDto {
    @ApiProperty({
        description: "Полное название единицы измерения",
        example: "Килограмм",
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

    @ApiProperty({
        description: "Краткое название единицы измерения",
        example: "кг",
        maxLength: 10,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(10)
    @Transform(({ value }) => {
        if (typeof value === "string") {
            return value.trim();
        }
        return value;
    })
    shortName!: string;
}
