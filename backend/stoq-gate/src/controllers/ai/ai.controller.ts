import {
  Controller,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AiService } from './ai.service';
import { HttpExceptionFilter } from './http-exception.filter';
import { AiRecognitionDto, AiSupplyRecognitionDto } from './recognition.dto';
import { AiUploadInterceptor } from './ai-upload.interceptor';

@ApiTags('AI')
@Controller('ai')
@UseFilters(HttpExceptionFilter)
export class AiController {
  constructor(private readonly service: AiService) {}
  @Post()
  @HttpCode(200)
  @UseInterceptors(AiUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Распознать УПД через AI-сервис' })
  @ApiOkResponse({ type: AiRecognitionDto })
  @ApiResponse({
    status: 400,
    description: 'Некорректный или отсутствующий файл',
  })
  @ApiResponse({ status: 413, description: 'Превышен допустимый размер файла' })
  @ApiResponse({ status: 415, description: 'Неподдерживаемый формат' })
  @ApiResponse({
    status: 422,
    description: 'Не удалось распознать товарные строки',
  })
  @ApiResponse({
    status: 503,
    description: 'AI-сервис недоступен или ошибка OpenRouter',
  })
  @ApiResponse({
    status: 504,
    description: 'Превышено время ожидания AI-сервиса',
  })
  recognize(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.service.recognize(file);
  }
  @Post('supply')
  @HttpCode(200)
  @UseInterceptors(AiUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Распознать УПД и подготовить товары для поставки',
    description:
      'Ищет или создаёт товары в каталоге, исключает доставку. Поставка не сохраняется; номер и сроки годности заполняются пользователем.',
  })
  @ApiOkResponse({ type: AiSupplyRecognitionDto })
  @ApiResponse({
    status: 422,
    description: 'Нечитаемые строки или несовместимые единицы товаров',
  })
  prepareSupply(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.service.prepareSupply(file);
  }
  @Get('health')
  @ApiOperation({ summary: 'Проверить AI-сервис через RabbitMQ' })
  health() {
    return this.service.health();
  }
}
