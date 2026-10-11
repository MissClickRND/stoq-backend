import {
    ArrayMinSize,
    IsArray,
    IsInt,
    Min,
    ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { RecipeItemDto } from "./recipe-item.dto";
import { ApiProperty } from "@nestjs/swagger";

export class CreateRecipeDto {
    @ApiProperty({
        description: "ID блюда",
        example: 1,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dishId!: number;

    @ApiProperty({
        description: "Список продуктов и их количества",
        type: [RecipeItemDto],
        minItems: 1,
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => RecipeItemDto)
    items!: RecipeItemDto[];
}
