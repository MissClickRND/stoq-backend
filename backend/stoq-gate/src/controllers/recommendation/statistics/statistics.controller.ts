import { Controller, Get, HttpException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';

@ApiTags('Статистика')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  @ApiOperation({ summary: 'Получить статистику для блюд' })
  @ApiOkResponse({ description: 'Статистика по блюдам' })
  @Get('dishes')
  async getDishesStatistics() {
    const payload = {};
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_DISH_STATISTICS,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @ApiOperation({ summary: 'Получить статистику заказов за сегодня' })
  @ApiOkResponse({ description: 'Статистика заказов за сегодня' })
  @Get('orders/today')
  async getOrdersTodayStatistics() {
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_ORDER_STATISTICS_TODAY,
      {},
    );
    return this.handleRpcResponse(response);
  }
}
