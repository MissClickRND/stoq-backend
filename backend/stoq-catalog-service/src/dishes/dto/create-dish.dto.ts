import { Transform, Type } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength, IsNumber, IsOptional, ValidateNested, IsArray, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { RecipeItemDto } from "src/recipes/dto/recipe-item.dto";

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

    @ApiProperty({ description: "Категория блюда", example: "Салаты", required: false, maxLength: 100 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
    category?: string;

    @ApiProperty({
        description: "Описание блюда",
        example: "Говядина в сметанном соусе с нежным пюре.",
        maxLength: 500,
        required: false,
    })
    @IsString()
    @IsOptional()
    @MaxLength(500)
    description?: string;

    @ApiProperty({
        description: "URL изображения блюда",
        example: "https://example.com/images/beef-stroganoff.jpg",
        required: false,
    })
    @IsString()
    @IsOptional()
    imageURL?: string;

    @ApiProperty({
        description: "Цена продажи",
        example: 520,
        minimum: 0,
        required: false,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    salePrice?: number;

    @ApiProperty({
        description: "Список ингредиентов для рецепта",
        type: [RecipeItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecipeItemDto)
    recipeItems!: RecipeItemDto[];
}
