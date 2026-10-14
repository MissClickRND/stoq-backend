import { Controller, Get, HttpException, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';

@ApiTags('Рекоммендации')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }
  
  @ApiOperation({ summary: 'Получить стоп-лист блюд' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Подстрока для поиска блюда в стоп-листе',
    example: 'беф',
  })
  @ApiOkResponse({ description: 'Стоп-лист' })
  @Get()
  async findAll(@Query('search') search?: string) {
    const payload = { search: search };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_RECOMMENDATION,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @ApiOperation({ summary: 'Получить приоритетные блюда для приготовления' })
  @ApiOkResponse({ description: 'Рекомендации по приготовлению блюд' })
  @Get('dishes')
  async getDishRecommendations() {
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_DISH_RECOMMENDATION,
      {},
    );
    return this.handleRpcResponse(response);
  }
}
