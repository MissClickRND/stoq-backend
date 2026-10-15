import { Type } from "class-transformer";
import { IsInt, IsNumber, Min, ValidateNested, ArrayNotEmpty, IsArray, ArrayUnique, IsOptional, IsBoolean } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateQuantityItemDto {
    @ApiProperty({ description: "ID партии товара", example: 5 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    batchId!: number;

    @ApiProperty({ description: "Доступное количество", example: 12.5, minimum: 0 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    quantity!: number;

    @ApiPropertyOptional({ description: "Удалить партию из инвентаризации" })
    @IsOptional()
    @IsBoolean()
    remove?: boolean;
}

export class UpdateQuantityDto {
    @ApiProperty({ 
        type: [UpdateQuantityItemDto], 
        description: "Массив обновлений количества" 
    })
    @ValidateNested({ each: true })
    @Type(() => UpdateQuantityItemDto)
    @ArrayNotEmpty()
    @IsArray()
    @ArrayUnique((item: UpdateQuantityItemDto) => item.batchId)
    items!: UpdateQuantityItemDto[];

    @ApiPropertyOptional({ description: "Вернуть серверный отчёт вместе с обновлёнными партиями" })
    @IsOptional()
    @IsBoolean()
    includeReport?: boolean;
}
