import { Controller, HttpCode, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ErrorDto, RecognitionDto } from './product.dto';
import { ServiceKeyGuard } from './service-key.guard';
import { UpdService } from './upd.service';

@ApiTags('УПД')
@Controller('ai')
export class UpdController {
  constructor(private readonly service: UpdService) {}
  @Post()
  @HttpCode(200)
  @UseGuards(ServiceKeyGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiSecurity('serviceKey')
  @ApiOperation({ summary: 'Распознать продавца и товары из УПД', description: 'Один PNG, JPEG, WEBP или PDF. Результат — объект { sellerName, items }. price — графа 4, totalPrice — графа 9, оба округлены до целого рубля. quantity — только графа 3, коды игнорируются. sellerName — строка Продавец (2) без кавычек. Нечитаемые поля — null, суммы не вычисляются. Лимиты задаются через .env.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'Изображение или PDF УПД' } } } })
  @ApiOkResponse({ type: RecognitionDto })
  @ApiResponse({ status: 400, type: ErrorDto, description: 'Нет файла, пустой или поврежденный файл, некорректный multipart' })
  @ApiResponse({ status: 401, type: ErrorDto, description: 'Неверный X-Service-Key (если настроен)' })
  @ApiResponse({ status: 413, type: ErrorDto, description: 'Превышен размер, число страниц или пикселей' })
  @ApiResponse({ status: 415, type: ErrorDto, description: 'Неподдерживаемый или поддельный формат файла' })
  @ApiResponse({ status: 422, type: ErrorDto, description: 'Не УПД, нечитаемый документ, нет товаров или отказ модели' })
  @ApiResponse({ status: 502, type: ErrorDto, description: 'Ошибка OpenRouter, неполный ответ или неверная структура' })
  @ApiResponse({ status: 503, type: ErrorDto, description: 'Сервис занят, баланс/лимит OpenRouter, ошибка ключа или сети' })
  @ApiResponse({ status: 504, type: ErrorDto, description: 'Таймаут OpenRouter' })
  recognize(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.service.recognize(file);
  }
}
