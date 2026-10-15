import { Roles } from '../../../auth/auth.decorators';
import { FULL_ACCESS, STAFF } from '../../../auth/auth.types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { CreateProductDto } from './dto/create-product.dto';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';
import { CreateUnitDto } from './dto/create-unit.dto';

@ApiTags('Товары')
@ApiExtraModels(CreateProductDto)
@Controller('product')
@Roles(...FULL_ACCESS)
export class ProductController {
  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new HttpException(response.error.message, response.error.status);
    }
    return response.data;
  }

  @ApiOperation({ summary: 'Получить список товаров' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Подстрока для поиска по названию товара',
    example: 'мол',
  })
  @ApiOkResponse({ description: 'Список активных товаров' })
  @Get()
  @Roles(...STAFF)
  async findAll(@Query('search') search?: string) {
    const payload = { search: search };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_PRODUCT,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Post('few')
  @ApiOperation({ summary: 'Создать несколько товаров' })
  @ApiBody({ type: [CreateProductDto] })
  @ApiCreatedResponse({ description: 'Товары успешно созданы' })
  @ApiNotFoundResponse({
    description: 'Указанная единица измерения не найдена',
  })
  async createMany(
    @Body(
      new ParseArrayPipe({
        items: CreateProductDto,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateProductDto[],
  ) {
    const payload = dto;
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CREATE_MANY_PRODUCT,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Post('units')
  @ApiOperation({ summary: 'Создать единицу измерения' })
  @ApiBody({ type: CreateUnitDto })
  @ApiCreatedResponse({ description: 'Единица измерения успешно создана' })
  @ApiBadRequestResponse({
    description: 'Переданы некорректные данные единицы измерения',
  })
  @ApiConflictResponse({
    description: 'Такая единица измерения уже существует',
  })
  async createUnit(@Body() dto: CreateUnitDto) {
    const payload = { dto: dto };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CREATE_UNIT,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get('units')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Получить список единиц измерения' })
  @ApiOkResponse({ description: 'Список единиц измерения' })
  async findAllUnits() {
    const payload = {};
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_UNIT,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get(':id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Получить продукт по ID' })
  @ApiParam({ name: 'id', description: 'ID продукта', example: 1 })
  @ApiOkResponse({ description: 'Найденный продукт' })
  @ApiBadRequestResponse({ description: 'Некорректный ID продукта' })
  @ApiNotFoundResponse({ description: 'Продукт не найден' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const payload = { id: id };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_PRODUCT_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить товар' })
  @ApiParam({ name: 'id', description: 'Идентификатор товара', example: 1 })
  @ApiOkResponse({ description: 'Товар помечен как удалённый' })
  @ApiNotFoundResponse({ description: 'Товар не найден' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    const payload = { id: id };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.DEL_PRODUCT_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Get('units/:id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Получить единицу измерения по ID' })
  @ApiParam({ name: 'id', description: 'ID единицы измерения', example: 1 })
  @ApiOkResponse({ description: 'Найденная единица измерения' })
  @ApiBadRequestResponse({ description: 'Некорректный ID единицы измерения' })
  @ApiNotFoundResponse({ description: 'Единица измерения не найдена' })
  async findOneUnit(@Param('id', ParseIntPipe) id: number) {
    const payload = { id: id };
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_UNIT_BY_ID,
      payload,
    );
    return this.handleRpcResponse(response);
  }

  @Post()
  @ApiOperation({ summary: 'Создать товар' })
  @ApiBody({ type: CreateProductDto })
  @ApiCreatedResponse({ description: 'Товар успешно создан' })
  @ApiNotFoundResponse({
    description: 'Указанная единица измерения не найдена',
  })
  async create(@Body() dto: CreateProductDto) {
    const payload = dto;
    const response = await this.commandBusService.sendCommand(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.CREATE_PRODUCT,
      payload,
    );
    return this.handleRpcResponse(response);
  }
}
