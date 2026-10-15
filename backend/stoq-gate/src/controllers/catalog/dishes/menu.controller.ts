import { Controller, Get, HttpException, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GuestMenuDishResponseDto } from './dto/guest-menu-response.dto';
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
  @ApiOkResponse({ type: [GuestMenuDishResponseDto] })
  async findAll(@Query('search') search?: string): Promise<GuestMenuDishResponseDto[]> {
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
    const dishes: GuestMenuDishResponseDto[] = response.data.map((dish: any) => ({
      id: dish.id,
      name: dish.name,
      category: dish.category,
      description: dish.description ?? '',
      imageURL: dish.imageURL ?? null,
      salePrice: dish.salePrice,
      available: dish.availablePortions > 0,
      recommended: false,
      recommendationRank: null,
    }));

    // Only publish the ranking; recommendation costs, stock and reasons stay private.
    try {
      const recommendations: any = await this.bus.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_DISH_RECOMMENDATION,
        {},
        { timeoutMs: 1000 },
      );
      if (recommendations?.success && Array.isArray(recommendations.data)) {
        const catalog = new Map(dishes.map(dish => [dish.id, dish]));
        let rank = 0;
        for (const recommendation of recommendations.data) {
          const dish = catalog.get(recommendation?.dishId);
          if (!dish?.available || dish.recommended) continue;
          dish.recommended = true;
          dish.recommendationRank = ++rank;
          if (rank === 10) break;
        }
      }
    } catch {
      // Recommendations are optional: a timeout must not hide the menu or photos.
    }
    return dishes.sort((a, b) =>
      (a.recommendationRank ?? Infinity) - (b.recommendationRank ?? Infinity),
    );
  }
}
