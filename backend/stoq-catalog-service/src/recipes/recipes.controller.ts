import {
    Controller,
    Get,
    Put,
    Delete,
    Param,
    Body,
    ParseIntPipe,
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
    ApiTags,
} from "@nestjs/swagger";
import { RecipesService } from "./recipes.service";
import { CreateRecipeDto } from "./dto/create-recipe.dto";
import { AddRecipeItemsDto } from "./dto/add-recipe-item.dto";

@ApiTags("Рецепты")
@Controller("recipes")
export class RecipesController {
    constructor(private readonly recipesService: RecipesService) {}

    @Get()
    @ApiOperation({ summary: "Получить список блюд с рецептами" })
    @ApiOkResponse({ description: "Список блюд с составами рецептов" })
    findAll() {
        return this.recipesService.findAll();
    }

    @Get(":id")
    @ApiOperation({ summary: "Получить рецепт блюда по ID" })
    @ApiParam({ name: "id", description: "ID блюда", example: 1 })
    @ApiOkResponse({ description: "Блюдо с составом рецепта" })
    @ApiBadRequestResponse({ description: "Некорректный ID блюда" })
    @ApiNotFoundResponse({ description: "Блюдо не найдено" })
    findOne(@Param("id", ParseIntPipe) id: number) {
        return this.recipesService.findOne(id);
    }

    @Put()
    @ApiOperation({ summary: "Создать рецепт для блюда" })
    @ApiBody({ type: CreateRecipeDto })
    @ApiCreatedResponse({ description: "Рецепт успешно создан" })
    @ApiBadRequestResponse({ description: "Переданы некорректные или повторяющиеся продукты" })
    @ApiConflictResponse({ description: "У блюда уже есть состав рецепта" })
    @ApiNotFoundResponse({ description: "Блюдо не найдено" })
    create(@Body() dto: CreateRecipeDto) {
        return this.recipesService.create(dto);
    }

    @Put(":recipeId")
    @ApiOperation({ summary: "Добавить продукты в рецепт" })
    @ApiParam({ name: "recipeId", description: "ID блюда", example: 1 })
    @ApiBody({ type: AddRecipeItemsDto })
    @ApiOkResponse({ description: "Рецепт успешно дополнен" })
    @ApiBadRequestResponse({ description: "Переданы некорректные или повторяющиеся продукты" })
    @ApiConflictResponse({ description: "Продукт уже добавлен в рецепт" })
    @ApiNotFoundResponse({ description: "Блюдо не найдено" })
    addItems(
        @Param("recipeId", ParseIntPipe) recipeId: number,
        @Body() dto: AddRecipeItemsDto,
    ) {
        return this.recipesService.addItems(recipeId, dto);
    }

    @Delete(":recipeId")
    @ApiOperation({ summary: "Удалить состав рецепта" })
    @ApiParam({ name: "recipeId", description: "ID блюда", example: 1 })
    @ApiOkResponse({ description: "Состав рецепта успешно удалён" })
    @ApiBadRequestResponse({ description: "Некорректный ID блюда" })
    @ApiNotFoundResponse({ description: "Блюдо или состав рецепта не найден" })
    remove(@Param("recipeId", ParseIntPipe) recipeId: number) {
        return this.recipesService.remove(recipeId);
    }
}
