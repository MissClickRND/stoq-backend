import {
  Controller,
  Get,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpException,
  Post,
} from '@nestjs/common';
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
} from '@nestjs/swagger';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { AddRecipeItemsDto } from './dto/add-recipe-item.dto';
import { CommandBusService } from 'src/infrastructure/rabbit/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitmq-topology';

@ApiTags('Рецепты')
@Controller('recipes')
export class RecipesController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  @Get()
  @ApiOperation({ summary: 'Получить список блюд с рецептами' })
  @ApiOkResponse({ description: 'Список блюд с составами рецептов' })
  async findAll() {
    const payload = {};
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_RECIPES,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить рецепт блюда по ID' })
  @ApiParam({ name: 'id', description: 'ID блюда', example: 1 })
  @ApiOkResponse({ description: 'Блюдо с составом рецепта' })
  @ApiBadRequestResponse({ description: 'Некорректный ID блюда' })
  @ApiNotFoundResponse({ description: 'Блюдо не найдено' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const payload = { id: id };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_RECIPES_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Post()
  @ApiOperation({ summary: 'Создать рецепт для блюда' })
  @ApiBody({ type: CreateRecipeDto })
  @ApiCreatedResponse({ description: 'Рецепт успешно создан' })
  @ApiBadRequestResponse({
    description: 'Переданы некорректные или повторяющиеся продукты',
  })
  @ApiConflictResponse({ description: 'У блюда уже есть состав рецепта' })
  @ApiNotFoundResponse({ description: 'Блюдо не найдено' })
  async create(@Body() dto: CreateRecipeDto) {
    const payload = { dto: dto };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CREATE_RECIPES,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Post(':recipeId')
  @ApiOperation({ summary: 'Добавить продукты в рецепт' })
  @ApiParam({ name: 'recipeId', description: 'ID блюда', example: 1 })
  @ApiBody({ type: AddRecipeItemsDto })
  @ApiOkResponse({ description: 'Рецепт успешно дополнен' })
  @ApiBadRequestResponse({
    description: 'Переданы некорректные или повторяющиеся продукты',
  })
  @ApiConflictResponse({ description: 'Продукт уже добавлен в рецепт' })
  @ApiNotFoundResponse({ description: 'Блюдо не найдено' })
  async addItems(
    @Param('recipeId', ParseIntPipe) recipeId: number,
    @Body() dto: AddRecipeItemsDto,
  ) {
    const payload = { recipeId: recipeId, dto: dto };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.ADD_ITEM_TO_RECIPES,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Delete(':recipeId')
  @ApiOperation({ summary: 'Удалить состав рецепта' })
  @ApiParam({ name: 'recipeId', description: 'ID блюда', example: 1 })
  @ApiOkResponse({ description: 'Состав рецепта успешно удалён' })
  @ApiBadRequestResponse({ description: 'Некорректный ID блюда' })
  @ApiNotFoundResponse({ description: 'Блюдо или состав рецепта не найден' })
  async remove(@Param('recipeId', ParseIntPipe) recipeId: number) {
    const payload = { recipeId: recipeId };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.DEL_RECIPES_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }
}
