import { SupplyResponseDto } from '../common/dto/business-response.dto';
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { CreateSupplyDto } from "./dto/requests/create-supply.dto";
import { SupplyService } from "./supplies.service";

@ApiTags("Поставки")
@Controller("supplies")
export class SupplyController {
  constructor(private readonly supplyService: SupplyService) {}

  @Post()
  @ApiOperation({ summary: "Принять новую поставку" })
  @ApiBody({ type: CreateSupplyDto })
  @ApiCreatedResponse({ type: SupplyResponseDto, description: "Поставка успешно принята" })
  @ApiConflictResponse({
    description: "Поставка с таким номером уже существует",
  })
  async create(@Body() dto: CreateSupplyDto) {
    return this.supplyService.createSupply(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Изменить поставку' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateSupplyDto) {
    return this.supplyService.updateSupply(id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Получить список всех поставок" })
  @ApiOkResponse({ type: SupplyResponseDto, isArray: true, description: "Список поставок" })
  async findAll() {
    return this.supplyService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить детали поставки" })
  @ApiParam({ name: "id", description: "ID поставки", example: 1 })
  @ApiOkResponse({ type: SupplyResponseDto, description: "Детали поставки" })
  @ApiBadRequestResponse({ description: "Некорректный ID поставки" })
  @ApiNotFoundResponse({ description: "Поставка не найдена" })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    return this.supplyService.findOne(id);
  }
}
