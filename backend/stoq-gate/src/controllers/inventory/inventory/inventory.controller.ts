import { InventoryResponseDto } from '../../../common/dto/business-response.dto';
import { Roles } from '../../../auth/auth.decorators';
import { STAFF } from '../../../auth/auth.types';
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  HttpException,
  Put,
  Query,
  Delete,
  Req,
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
import {
  EXCHANGES,
  ROUTING_KEYS,
} from '../../../common/rabbitMQ/rabbitmq-topology';

@ApiTags('Остатки')
@Controller('inventory')
@Roles(...STAFF)
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
  @ApiOkResponse({
    type: InventoryResponseDto,
    isArray: true,
    description: 'Список продуктов на складе',
  })
  async findAll(@Query('search') search?: string) {
    const payload = { search: search };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_INVENTORY,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Post('stock')
  @ApiOperation({ summary: 'Получить остатки для списка продуктов' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        productIds: {
          type: 'array',
          items: { type: 'number' },
          example: [1, 2, 3],
        },
      },
      required: ['productIds'],
    },
    description: 'Массив ID продуктов',
  })
  @ApiOkResponse({
    type: InventoryResponseDto,
    isArray: true,
    description: 'Остатки запрошенных продуктов',
  })
  async getStock(@Body() body: { productIds: number[] }) {
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_INVENTORY_STOCK,
      body,
    );
    return this.handleRpcResponse(response);
  }

  @Get('expiring')
  @ApiOperation({
    summary: 'Получить партии, срок годности которых скоро истекает',
  })
  @ApiQuery({
    name: 'daysThreshold',
    type: Number,
    required: true,
    description: 'Количество дней до истечения срока годности',
    example: '7',
  })
  @ApiOkResponse({
    type: InventoryResponseDto,
    isArray: true,
    description: 'Список скоро истекающих партий',
  })
  async getExpiring(
    @Query('daysThreshold', ParseIntPipe) daysThreshold: number,
  ) {
    const payload = { daysThreshold };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_EXPIRING_INVENTORY,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Статистика продуктов и остатков склада' })
  async getStatistics() {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.GET_INVENTORY_STATISTICS, {},
    ));
  }

  @Get('write-offs')
  @ApiOperation({ summary: 'История автоматических списаний просроченных партий' })
  async getWriteOffs() {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.GET_INVENTORY_WRITE_OFFS, {},
    ));
  }

  @Post('preview')
  @ApiOperation({ summary: 'Предварительные итоги инвентаризации по сохранённым остаткам' })
  async preview(@Body() dto: UpdateQuantityDto) {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.PREVIEW_INVENTORY, { dto },
    ));
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Получить информацию о продукте на складе' })
  @ApiParam({
    name: 'productId',
    description: 'ID продукта',
    example: '5',
  })
  @ApiOkResponse({
    type: InventoryResponseDto,
    isArray: true,
    description: 'Партии продукта',
  })
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

  @Post(':batchId/write-off')
  @ApiOperation({ summary: 'Списать доступный остаток складской партии' })
  async writeOff(@Param('batchId', ParseIntPipe) batchId: number, @Req() req?: any) {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.UPDATE_QUANTITY_INVENTORY,
      { dto: { items: [{ batchId, quantity: 0 }] }, operation: 'WRITE_OFF', ...(req?.user ? { actor: { id: req.user.id, name: req.user.fullName, role: req.user.role } } : {}) },
    ));
  }

  @Delete('write-offs/:batchId')
  @ApiOperation({ summary: 'Убрать утилизированную партию из списка просрочки, сохранив историю' })
  async dispose(@Param('batchId', ParseIntPipe) batchId: number) {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(EXCHANGES.COMMANDS,
      ROUTING_KEYS.DISPOSE_INVENTORY_BATCH, { batchId }));
  }

  @Put()
  @ApiOperation({ summary: 'Обновить количество продукта на складе' })
  @ApiBody({ type: UpdateQuantityDto })
  @ApiOkResponse({
    type: InventoryResponseDto,
    description: 'Количество успешно обновлено',
  })
  @ApiNotFoundResponse({ description: 'Партия не найдена' })
  async updateQuantity(@Body() dto: UpdateQuantityDto, @Req() req?: any) {
    const payload = { dto, ...(req?.user ? { actor: { id: req.user.id, name: req.user.fullName, role: req.user.role } } : {}) };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.UPDATE_QUANTITY_INVENTORY,
      payload,
    );
    return this.handleRpcResponse(response);
  }
}
