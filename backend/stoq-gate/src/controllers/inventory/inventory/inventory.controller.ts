import { InventoryResponseDto } from '../../../common/dto/business-response.dto';
import {
  Controller,
  Get,
  Param,
  Body,
  ParseIntPipe,
  HttpException,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { UpdateQuantityDto } from './dto/update-quantity.dto';
import { CommandBusService } from '../../../common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from '../../../common/rabbitMQ/rabbitmq-topology';

@ApiTags('Остатки')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  @Get()
  @ApiOperation({ summary: 'Получить все продукты на складе' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Подстрока для поиска по названию товара',
    example: 'мол',
  })
  @ApiOkResponse({ type: InventoryResponseDto, isArray: true, description: 'Список продуктов на складе' })
  async findAll(@Query('search') search?: string) {
    const payload = { search: search };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_INVENTORY,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Получить информацию о продукте на складе' })
  @ApiParam({
    name: 'productId',
    description: 'ID продукта',
    example: '5',
  })
  @ApiOkResponse({ type: InventoryResponseDto, isArray: true, description: 'Партии продукта' })
  @ApiNotFoundResponse({ description: 'Продукт не найден на складе' })
  async findOne(@Param('productId', ParseIntPipe) productId: number) {
    const payload = { productId: productId };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_INVENTORY_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Put()
  @ApiOperation({ summary: 'Обновить количество продукта на складе' })
  @ApiBody({ type: UpdateQuantityDto })
  @ApiOkResponse({ type: InventoryResponseDto, description: 'Количество успешно обновлено' })
  @ApiNotFoundResponse({ description: 'Партия не найдена' })
  async updateQuantity(@Body() dto: UpdateQuantityDto) {
    const payload = { dto: dto };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.UPDATE_QUANTITY_INVENTORY,
      payload,
    );
    return this.handleRpcResponse(response);
  }
}
