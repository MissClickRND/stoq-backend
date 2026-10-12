import {
  Controller,
  Get,
  Param,
  Body,
  ParseIntPipe,
  HttpException,
  Put,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { CommandBusService } from 'src/infrastructure/rabbit/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitmq-topology';
import { UpdateQuantityDto } from './dto/update-quantity.dto';

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
  @ApiOkResponse({ description: 'Список продуктов на складе' })
  async findAll() {
    const payload = {};
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
  @ApiOkResponse({ description: 'Информация о продукте' })
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
  @ApiOkResponse({ description: 'Количество успешно обновлено' })
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
