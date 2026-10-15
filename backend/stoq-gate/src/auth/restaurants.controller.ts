import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './auth.decorators';
import { ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';

@ApiTags('Рестораны')
@Public()
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'Список ресторанов для выбора при регистрации и гостевом заказе' })
  findAll() { return this.auth.request(ROUTING_KEYS.AUTH_GET_RESTAURANTS, {}); }
}
