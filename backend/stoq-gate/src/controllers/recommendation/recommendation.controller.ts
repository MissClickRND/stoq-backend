import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';
import { DishRecommendationsDto } from './dto/dish-recommendations.dto';

@ApiTags('Recommendations')
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

  @Post('dishes')
  async getDishRecommendations(@Body() dto: DishRecommendationsDto) {
    const payload = { dto: dto };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_DISH_RECOMMENDATION,
      payload,
    );
    return this.handleRpcResponse(response);
  }
}
