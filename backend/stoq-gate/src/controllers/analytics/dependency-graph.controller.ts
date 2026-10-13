import { Controller, Get } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DependencyGraphService } from './dependency-graph.service';
import { DependencyGraphResponseDto, DishGraphNodeDto, IngredientGraphNodeDto } from './dependency-graph.dto';

@ApiTags('Аналитика')
@ApiExtraModels(IngredientGraphNodeDto, DishGraphNodeDto)
@Controller('analytics')
export class DependencyGraphController {
  constructor(private readonly service: DependencyGraphService) {}
  @Get('dependencies')
  @ApiOperation({ summary: 'Получить граф зависимостей ингредиентов и блюд',
    description: 'Пригодные доступные остатки и расход на порцию в единицах продукта. Статусы рассчитывает backend: 1–5 порций — low_stock, меньше 1 — unavailable, больше 5 — available. Ингредиент с нулевым остатком — out_of_stock. ID стабильны и основаны на ID продукта, блюда и строки рецепта.' })
  @ApiOkResponse({ type: DependencyGraphResponseDto })
  @ApiResponse({ status: 502, description: 'Некорректные данные каталога' })
  @ApiResponse({ status: 503, description: 'Каталог, склад или брокер недоступны' })
  getGraph() { return this.service.getGraph(); }
}
