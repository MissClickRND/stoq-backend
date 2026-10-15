import { Body, Controller, ForbiddenException, HttpException, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CommandBusService } from '../../common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from '../../common/rabbitMQ/rabbitmq-topology';

class ResetBusinessDataDto {
  @ApiProperty({ enum: ['RESET'] })
  @IsIn(['RESET'])
  confirmation!: string;
}

@ApiTags('Тестовые данные')
@Controller('test')
export class TestController {
  constructor(private readonly commandBusService: CommandBusService) {}

  @Post('reset')
  @ApiOperation({ summary: 'Сбросить заказы, склад, поставки, блюда и продукты; сохранить аккаунты и единицы' })
  async reset(@Body() dto: ResetBusinessDataDto) {
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_TOOLS !== 'true') {
      throw new ForbiddenException('Тестовый сброс отключён. Включите ENABLE_TEST_TOOLS на тестовом окружении');
    }
    const result: Record<string, unknown> = {};
    for (const [name, command] of [
      ['orders', ROUTING_KEYS.RESET_ORDER_DATA],
      ['inventory', ROUTING_KEYS.RESET_INVENTORY_DATA],
      ['catalog', ROUTING_KEYS.RESET_CATALOG_DATA],
    ]) {
      let response: any;
      try {
        response = await this.commandBusService.sendCommand(EXCHANGES.COMMANDS, command, { confirmation: dto.confirmation });
      } catch {
        throw new HttpException({ message: `Сброс прерван: сервис ${name} недоступен. Завершённые этапы: ${Object.keys(result).join(', ') || 'нет'}`, completed: result }, 503);
      }
      if (!response?.success) throw new HttpException({
        message: `Сброс прерван на этапе ${name}. Завершённые этапы: ${Object.keys(result).join(', ') || 'нет'}. ${response?.error?.message ?? ''}`,
        completed: result,
      }, response?.error?.status ?? 503);
      result[name] = response.data;
    }
    return result;
  }
}
