import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Put,
} from "@nestjs/common";
import {
    ApiBody,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from "@nestjs/swagger";

import { InventoryService } from "./inventory.service";
import { UpdateQuantityDto } from "./dto/update-quantity.dto";

@ApiTags("Остатки")
@Controller("inventory")
export class InventoryController {
    constructor(private readonly inventoryService: InventoryService) {}

    @Get()
    @ApiOperation({ summary: "Получить все продукты на складе" })
    @ApiOkResponse({ description: "Список продуктов на складе" })
    findAll() {
        return this.inventoryService.findAll();
    }

    @Get(":productId")
    @ApiOperation({ summary: "Получить информацию о продукте на складе" })
    @ApiParam({
        name: "productId",
        description: "ID продукта",
        example: "5",
    })
    @ApiOkResponse({ description: "Информация о продукте" })
    @ApiNotFoundResponse({ description: "Продукт не найден на складе" })
    findOne(@Param("productId", ParseIntPipe) productId: number) {
        return this.inventoryService.findOne(productId);
    }

    @Put()
    @ApiOperation({ summary: "Обновить количество продукта на складе" })
    @ApiBody({ type: UpdateQuantityDto })
    @ApiOkResponse({ description: "Количество успешно обновлено" })
    @ApiNotFoundResponse({ description: "Партия не найдена" })
    updateQuantity(@Body() dto: UpdateQuantityDto) {
        return this.inventoryService.updateQuantity(dto);
    }
}
