import { Type } from "class-transformer";
import { IsInt, IsNumber, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateQuantityDto {
    @ApiProperty({
        description: "ID партии товара",
        example: 5,
        format: "id",
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    batchId!: number;

    @ApiProperty({
        description: "Доступное количество товара в партии",
        example: 12.5,
        minimum: 0,
    })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    quantity!: number;
}
