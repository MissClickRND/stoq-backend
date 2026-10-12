import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
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
import { OrdersService } from './orders.service';
import { AddOrderItemsDto } from './dto/add-item.dto';

@ApiTags('Заказы')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Создать заказ' })
  @ApiCreatedResponse({ description: 'Заказ успешно создан' })
  create() {
    return this.ordersService.create();
  }

  @Get()
  @ApiOperation({ summary: 'Получить список заказов' })
  @ApiOkResponse({ description: 'Список заказов' })
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить заказ по ID' })
  @ApiParam({ name: 'id', description: 'ID заказа', example: 1 })
  @ApiOkResponse({ description: 'Заказ найден' })
  @ApiBadRequestResponse({ description: 'Некорректный ID заказа' })
  @ApiNotFoundResponse({ description: 'Заказ не найден' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
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
  addItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddOrderItemsDto,
  ) {
    return this.ordersService.addItems({
      orderId: id,
      dto,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить заказ' })
  @ApiParam({ name: 'id', description: 'ID заказа', example: 1 })
  @ApiOkResponse({ description: 'Заказ успешно удалён' })
  @ApiBadRequestResponse({ description: 'Некорректный ID заказа' })
  @ApiNotFoundResponse({ description: 'Заказ не найден' })
  @ApiConflictResponse({ description: 'Нельзя удалить закрытый заказ' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.remove(id);
  }
}
