import { Controller, Get, HttpException } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  DependencyGraphResponseDto,
  DishGraphNodeDto,
  IngredientGraphNodeDto,
} from './dependency-graph.dto';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';

@ApiTags('Аналитика')
@ApiExtraModels(IngredientGraphNodeDto, DishGraphNodeDto)
@Controller('analytics')
export class DependencyGraphController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  @Get('graph')
  @ApiOperation({
    summary: 'Получить граф зависимостей ингредиентов и блюд',
    description:
      'Пригодные доступные остатки и расход на порцию в единицах продукта. Статусы рассчитывает backend: 1–5 порций — low_stock, меньше 1 — unavailable, больше 5 — available. Ингредиент с нулевым остатком — out_of_stock. ID стабильны и основаны на ID продукта, блюда и строки рецепта.',
  })
  @ApiOkResponse({ type: DependencyGraphResponseDto })
  @ApiResponse({ status: 502, description: 'Некорректные данные каталога' })
  @ApiResponse({
    status: 503,
    description: 'Каталог, склад или брокер недоступны',
  })
  async getGraph() {
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_DEPENDENCY_GRAPH,
      {},
    );
    return this.handleRpcResponse(response);
  }
}
