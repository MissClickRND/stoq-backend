import { OrderResponseDto } from '../../common/dto/business-response.dto';
import {
  Controller,
  Get,
  Param,
  Body,
  ParseIntPipe,
  HttpException,
  Delete,
  Post,
  Patch,
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
import { CreateOrderDto } from './dto/request/create-order.dto';
import { ChangeStatusDto } from './dto/request/change-status.dto';
import { OrderErrorDto } from './dto/response/order-error.dto';
import { Roles, AllowGuest } from '../../auth/auth.decorators';
import { OPERATIONS } from '../../auth/auth.types';

@ApiTags('Заказы')
@Controller('orders')
@Roles(...OPERATIONS)
export class OrderController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException({
        statusCode: response.error.status,
        message: response.error.message,
        products: response.error.products ?? [],
      }, response.error.status);
    }
    return response.data;
  }

  @Post()
  @AllowGuest()
  @ApiOperation({
    summary: 'Создать заказ (опционально сразу с блюдами)',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiCreatedResponse({ type: OrderResponseDto,
    description: 'Заказ успешно создан',
  })
  @ApiBadRequestResponse({
    type: OrderErrorDto,
    description: 'Некорректные данные',
  })
  @ApiConflictResponse({
    description: 'В запросе есть повторяющиеся блюда',
  })
  async create(@Body() dto: CreateOrderDto) {
    const payload = { dto: dto };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CREATE_ORDER,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список заказов' })
  @ApiOkResponse({ type: OrderResponseDto, isArray: true, description: 'Список заказов' })
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
  @ApiOkResponse({ type: OrderResponseDto, description: 'Заказ найден' })
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
  @ApiCreatedResponse({ type: OrderResponseDto, description: 'Блюда добавлены в заказ' })
  @ApiBadRequestResponse({ type: OrderErrorDto, description: 'Некорректные данные или недостаточно продуктов' })
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

  @Patch(':id/status')
  @ApiOperation({ summary: 'Завершить заказ' })
  @ApiBadRequestResponse({ type: OrderErrorDto, description: 'Ошибка списания продуктов' })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Заказ завершён' })
  async changeStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeStatusDto) {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(EXCHANGES.COMMANDS,
      ROUTING_KEYS.CHANGE_ORDER_STATUS, { id, status: dto.status }));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить заказ' })
  @ApiParam({ name: 'id', description: 'ID заказа', example: 1 })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Заказ успешно удалён' })
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
