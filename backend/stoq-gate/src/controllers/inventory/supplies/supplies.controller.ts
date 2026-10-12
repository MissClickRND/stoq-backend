import {
  Controller,
  Get,
  Put,
  Body,
  Param,
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
import { CreateSupplyDto } from './dto/create-supply.dto';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitmq-topology';
import { CommandBusService } from 'src/infrastructure/rabbit/command-bus.service';

@ApiTags('Поставки')
@Controller('supplies')
export class SupplyController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  @Post()
  @ApiOperation({ summary: 'Принять новую поставку' })
  @ApiBody({ type: CreateSupplyDto })
  @ApiCreatedResponse({ description: 'Поставка успешно принята' })
  @ApiConflictResponse({
    description: 'Поставка с таким номером уже существует',
  })
  async create(@Body() dto: CreateSupplyDto) {
    const payload = { search: dto };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CREATE_SUPPLY,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список всех поставок' })
  @ApiOkResponse({ description: 'Список поставок' })
  async findAll() {
    const payload = {};
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_SUPPLY,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить детали поставки' })
  @ApiParam({ name: 'id', description: 'ID поставки', example: 1 })
  @ApiOkResponse({ description: 'Детали поставки' })
  @ApiBadRequestResponse({ description: 'Некорректный ID поставки' })
  @ApiNotFoundResponse({ description: 'Поставка не найдена' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const payload = { id: id };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_SUPPLY_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }
}
