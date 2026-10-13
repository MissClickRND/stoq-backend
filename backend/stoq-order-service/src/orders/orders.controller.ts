import { OrderResponseDto } from '../common/dto/business-response.dto';
import {
  Controller,
  Get,
  Delete,
  Param,
  Body,
  ParseIntPipe,
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

import { OrdersService } from './orders.service';
import { AddOrderItemsDto } from './dto/add-item.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ChangeStatusDto } from './dto/change-status.dto';

@ApiTags('Заказы')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Создать заказ (опционально сразу с блюдами)',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiCreatedResponse({ type: OrderResponseDto,
    description: 'Заказ успешно создан',
  })
  @ApiBadRequestResponse({
    description: 'Некорректные данные',
  })
  @ApiConflictResponse({
    description: 'В запросе есть повторяющиеся блюда',
  })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список заказов' })
  @ApiOkResponse({ type: OrderResponseDto, isArray: true, description: 'Список заказов' })
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить заказ по ID' })
  @ApiParam({ name: 'id', description: 'ID заказа', example: 1 })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Заказ найден' })
  @ApiBadRequestResponse({ description: 'Некорректный ID заказа' })
  @ApiNotFoundResponse({ description: 'Заказ не найден' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Добавить блюда в заказ' })
  @ApiParam({ name: 'id', description: 'ID заказа', example: 1 })
  @ApiBody({ type: AddOrderItemsDto })
  @ApiCreatedResponse({ type: OrderResponseDto, description: 'Блюда добавлены в заказ' })
  @ApiBadRequestResponse({ description: 'Некорректные данные' })
  @ApiNotFoundResponse({ description: 'Заказ не найден' })
  @ApiConflictResponse({
    description: 'Блюдо уже добавлено или заказ закрыт',
  })
  addItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddOrderItemsDto,
  ) {
    return this.ordersService.addItems({
      orderId: id,
      dto,
    });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Завершить заказ' })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Заказ завершён' })
  changeStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeStatusDto) {
    return this.ordersService.changeStatus({ id, status: dto.status });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить заказ' })
  @ApiParam({ name: 'id', description: 'ID заказа', example: 1 })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Заказ успешно удалён' })
  @ApiBadRequestResponse({ description: 'Некорректный ID заказа' })
  @ApiNotFoundResponse({ description: 'Заказ не найден' })
  @ApiConflictResponse({ description: 'Нельзя удалить закрытый заказ' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.remove(id);
  }
}
