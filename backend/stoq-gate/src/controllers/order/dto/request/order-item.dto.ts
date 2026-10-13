import { IsInt, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class OrderItemDto {
    @ApiProperty({
        description: "Идентификатор блюда",
        example: 1,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dishId!: number;

    @ApiProperty({
        description: "Количество блюда в заказе",
        example: 2,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    quantity!: number;
}
