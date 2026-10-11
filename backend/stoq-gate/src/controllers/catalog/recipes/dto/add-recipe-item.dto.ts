import { ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { RecipeItemDto } from "./recipe-item.dto";
import { ApiProperty } from "@nestjs/swagger";

export class AddRecipeItemsDto {
    @ApiProperty({
        description: "Продукты и их количества для добавления в рецепт",
        type: [RecipeItemDto],
        minItems: 1,
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => RecipeItemDto)
    items!: RecipeItemDto[];
}
