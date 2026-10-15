import { Type } from "class-transformer";
import { IsInt, IsNumber, Min, ValidateNested, ArrayNotEmpty, IsBoolean, IsOptional, ArrayUnique } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

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

    @ApiProperty({ required: false, description: 'Удалить остаток партии из активного списка' })
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
    @ArrayUnique((item: UpdateQuantityItemDto) => item.batchId)
    items!: UpdateQuantityItemDto[];

    @ApiProperty({ required: false, description: 'Вернуть серверный отчёт инвентаризации' })
    @IsOptional()
    @IsBoolean()
    includeReport?: boolean;
}
