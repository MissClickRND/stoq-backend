import { Controller, Get, HttpException, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';
import { Roles } from '../../../auth/auth.decorators';
import { FULL_ACCESS, STAFF } from '../../../auth/auth.types';
import { DishStatisticsPeriodDto, StatisticsIdDto, StatisticsPeriodDto } from './statistics-query.dto';

@ApiTags('Статистика')
@Controller('statistics')
@Roles(...FULL_ACCESS)
export class StatisticsController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Статистика главной страницы за выбранный период' })
  async getDashboardStatistics(@Query() query: StatisticsPeriodDto) {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.GET_DASHBOARD_STATISTICS, { days: query.days },
    ));
  }

  @Get('dishes/:id')
  @ApiOperation({ summary: 'Продажи и расчётные показатели блюда за неделю' })
  async getDishDetailsStatistics(@Param() params: StatisticsIdDto, @Query() query: DishStatisticsPeriodDto) {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.GET_DISH_DETAILS_STATISTICS, { id: params.id, days: query.days },
    ));
  }

  @Get('shortages')
  @ApiOperation({ summary: 'Рейтинг продуктов по случаям дефицита' })
  async getShortageStatistics(@Query() query: StatisticsPeriodDto) {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.GET_SHORTAGE_STATISTICS, { days: query.days },
    ));
  }

  @Get('supplies')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Статистика поставок за текущий московский месяц' })
  async getSupplyStatistics() {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.GET_SUPPLY_STATISTICS, {},
    ));
  }

  @Get('supplies/:id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Итоговые показатели поставки' })
  async getSupplyDetailsStatistics(@Param() params: StatisticsIdDto) {
    return this.handleRpcResponse(await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS, ROUTING_KEYS.GET_SUPPLY_STATISTICS, { id: params.id },
    ));
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
