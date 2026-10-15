import { Controller, Get, HttpException, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowGuest, Roles } from '../../../auth/auth.decorators';
import { STAFF } from '../../../auth/auth.types';
import { CommandBusService } from '../../../common/rabbitMQ/command-bus.service';
import {
  EXCHANGES,
  ROUTING_KEYS,
} from '../../../common/rabbitMQ/rabbitmq-topology';

@ApiTags('Меню')
@AllowGuest()
@Roles(...STAFF)
@Controller('menu')
export class MenuController {
  constructor(private readonly bus: CommandBusService) {}

  @Get()
  @ApiOperation({ summary: 'Меню для гостя: блюда и цены продажи' })
  async findAll(@Query('search') search?: string) {
    const response: any = await this.bus.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_DISHES,
      { search },
    );
    if (!response?.success)
      throw new HttpException(
        response?.error?.message ?? 'Меню недоступно',
        response?.error?.status ?? 503,
      );
    return response.data.map((dish: any) => ({
      id: dish.id,
      name: dish.name,
      category: dish.category,
      salePrice: dish.salePrice,
      available: dish.availablePortions > 0,
    }));
  }
}
