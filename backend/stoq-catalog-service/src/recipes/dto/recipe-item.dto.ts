import { IsInt, Min } from "class-validator";
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
    @IsInt()
    @Min(1)
    quantity!: number;
}
