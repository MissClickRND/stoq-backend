import {
    Controller,
    Get,
    Delete,
    Param,
    Body,
    ParseIntPipe,
    Query,
    Post,
} from "@nestjs/common";
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from "@nestjs/swagger";
import { DishesService } from "./dishes.service";
import { CreateDishDto } from "./dto/create-dish.dto";

@ApiTags("Блюда")
@Controller("dishes")
export class DishesController {
    constructor(private readonly dishesService: DishesService) {}

    @Post()
    @ApiOperation({ summary: "Создать блюдо" })
    @ApiBody({ type: CreateDishDto })
    @ApiCreatedResponse({ description: "Блюдо успешно создано" })
    @ApiBadRequestResponse({
        description: "Переданы некорректные данные блюда",
    })
    @ApiConflictResponse({
        description: "Блюдо с таким названием уже существует",
    })
    create(@Body() dto: CreateDishDto) {
        return this.dishesService.create(dto);
    }

    @Get()
    @ApiOperation({ summary: "Получить список блюд" })
    @ApiQuery({
        name: "search",
        required: false,
        description: "Подстрока для поиска по названию блюда",
        example: "беф",
    })
    @ApiOkResponse({ description: "Список активных блюд" })
    findAll(@Query('search') search?: string) {
        return this.dishesService.findAll(search);
    }

    @Get(":id")
    @ApiOperation({ summary: "Получить блюдо по ID" })
    @ApiParam({ name: "id", description: "ID блюда", example: 1 })
    @ApiOkResponse({ description: "Найденное блюдо" })
    @ApiBadRequestResponse({ description: "Некорректный ID блюда" })
    @ApiNotFoundResponse({ description: "Блюдо не найдено" })
    findOne(@Param("id", ParseIntPipe) id: number) {
        return this.dishesService.findOne(id);
    }

    @Delete(":id")
    @ApiOperation({ summary: "Удалить блюдо" })
    @ApiParam({ name: "id", description: "ID блюда", example: 1 })
    @ApiOkResponse({ description: "Блюдо помечено как удалённое" })
    @ApiBadRequestResponse({ description: "Некорректный ID блюда" })
    @ApiNotFoundResponse({ description: "Блюдо не найдено" })
    remove(@Param("id", ParseIntPipe) id: number) {
        return this.dishesService.remove(id);
    }
}
