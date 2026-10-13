import { IsInt, Min, IsNumber, IsPositive } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RecipeItemDto {
    @ApiProperty({
        description: "Идентификатор продукта",
        example: 1,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    productId!: number;

    @ApiProperty({
        description: "Количество продукта в рецепте",
        example: 2,
        minimum: 1,
    })
    @IsNumber({ maxDecimalPlaces: 3 })
    @IsPositive()
    quantity!: number;
}
