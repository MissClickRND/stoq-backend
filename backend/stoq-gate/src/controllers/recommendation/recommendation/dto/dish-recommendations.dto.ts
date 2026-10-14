import {
    IsArray,
    IsDate,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    Min,
    ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class RecommendationRecipeItemDto {
    @IsInt()
    @IsPositive()
    productId!: number;

    @IsNumber()
    @IsPositive()
    quantityPerPortion!: number;

    @IsOptional()
    @IsString()
    productName?: string;
}

class RecommendationDishDto {
    @IsInt()
    @IsPositive()
    id!: number;

    @IsString()
    name!: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    salePrice!: number | null;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecommendationRecipeItemDto)
    recipeItems!: RecommendationRecipeItemDto[];
}

class RecommendationBatchDto {
    @IsInt()
    @IsPositive()
    productId!: number;

    @IsNumber()
    @Min(0)
    availableQuantity!: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    price!: number | null;

    @Type(() => Date)
    @IsDate()
    expiresAt!: Date;

    @IsIn(["ACTIVE", "DEPLETED", "EXPIRED", "QUARANTINED"])
    status!: "ACTIVE" | "DEPLETED" | "EXPIRED" | "QUARANTINED";
}

export class DishRecommendationsDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecommendationDishDto)
    dishes!: RecommendationDishDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecommendationBatchDto)
    batches!: RecommendationBatchDto[];
}
