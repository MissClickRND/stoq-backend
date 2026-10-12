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
import { CreateDishDto } from './dto/create-dish.dto';
import { CommandBusService } from 'src/infrastructure/rabbit/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitmq-topology';

@ApiTags('Блюда')
@Controller('dishes')
export class DishesController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  @Post()
  @ApiOperation({ summary: 'Создать блюдо' })
  @ApiBody({ type: CreateDishDto })
  @ApiCreatedResponse({ description: 'Блюдо успешно создано' })
  @ApiBadRequestResponse({ description: 'Переданы некорректные данные блюда' })
  @ApiConflictResponse({
    description: 'Блюдо с таким названием уже существует',
  })
  async create(@Body() dto: CreateDishDto) {
    const payload = { dto: dto };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CREATE_DISHES,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список блюд' })
  @ApiOkResponse({ description: 'Список активных блюд' })
  async findAll() {
    const payload = {};
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_DISHES,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить блюдо по ID' })
  @ApiParam({ name: 'id', description: 'ID блюда', example: 1 })
  @ApiOkResponse({ description: 'Найденное блюдо' })
  @ApiBadRequestResponse({ description: 'Некорректный ID блюда' })
  @ApiNotFoundResponse({ description: 'Блюдо не найдено' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const payload = { id: id };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_DISHES_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить блюдо' })
  @ApiParam({ name: 'id', description: 'ID блюда', example: 1 })
  @ApiOkResponse({ description: 'Блюдо помечено как удалённое' })
  @ApiBadRequestResponse({ description: 'Некорректный ID блюда' })
  @ApiNotFoundResponse({ description: 'Блюдо не найдено' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    const payload = { id: id };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.DEL_DISHES_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }
}
