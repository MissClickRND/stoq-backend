import {
  Controller,
  Get,
  Param,
  Body,
  ParseIntPipe,
  HttpException,
  Delete,
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

import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { AddOrderItemsDto } from './dto/request/add-item.dto';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';

@ApiTags('Заказы')
@Controller('orders')
export class OrderController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  @Post()
  @ApiOperation({ summary: 'Создать заказ' })
  @ApiCreatedResponse({ description: 'Заказ успешно создан' })
  async create() {
    const payload = {};
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CREATE_ORDER,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список заказов' })
  @ApiOkResponse({ description: 'Список заказов' })
  async findAll() {
    const payload = {};
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_ORDER,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить заказ по ID' })
  @ApiParam({ name: 'id', description: 'ID заказа', example: 1 })
  @ApiOkResponse({ description: 'Заказ найден' })
  @ApiBadRequestResponse({ description: 'Некорректный ID заказа' })
  @ApiNotFoundResponse({ description: 'Заказ не найден' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const payload = { id: id };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_ORDER_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Добавить блюда в заказ' })
  @ApiParam({ name: 'id', description: 'ID заказа', example: 1 })
  @ApiBody({ type: AddOrderItemsDto })
  @ApiCreatedResponse({ description: 'Блюда добавлены в заказ' })
  @ApiBadRequestResponse({ description: 'Некорректные данные' })
  @ApiNotFoundResponse({ description: 'Заказ не найден' })
  @ApiConflictResponse({
    description: 'Блюдо уже добавлено или заказ закрыт',
  })
  async addItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddOrderItemsDto,
  ) {
    const payload = { id: id, dto: dto };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.ADD_DISH_TO_ORDER,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить заказ' })
  @ApiParam({ name: 'id', description: 'ID заказа', example: 1 })
  @ApiOkResponse({ description: 'Заказ успешно удалён' })
  @ApiBadRequestResponse({ description: 'Некорректный ID заказа' })
  @ApiNotFoundResponse({ description: 'Заказ не найден' })
  @ApiConflictResponse({ description: 'Нельзя удалить закрытый заказ' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    const payload = { id: id };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.DEL_ORDER_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }
}
