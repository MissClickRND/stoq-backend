import { ApiProperty } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty({ type: String, nullable: true, example: 'Помидоры', description: 'Графа 1а. Нечитаемое значение — null.' })
  name!: string | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, example: 1, description: 'Количество, графа 3.' })
  quantity!: number | null;
  @ApiProperty({ type: 'integer', nullable: true, minimum: 0, example: 612, description: 'Цена за единицу, графа 4 (обычно без НДС), округлена до ближайшего целого рубля.' })
  price!: number | null;
  @ApiProperty({ type: 'integer', nullable: true, minimum: 0, example: 1224, description: 'Стоимость строки с налогом, графа 9, независимо округлена до ближайшего целого рубля. Не вычисляется из количества и цены.' })
  totalPrice!: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'кг', description: 'Графа 2а, условное обозначение, не код ОКЕИ.' })
  unit!: string | null;
}

export class RecognitionDto {
  @ApiProperty({ type: String, nullable: true, example: 'ООО Молочный двор', description: 'Наименование продавца из строки (2), без кавычек и лишних пробелов. Если не читается — null.' })
  sellerName!: string | null;
  @ApiProperty({ type: ProductDto, isArray: true, description: 'Товарные строки в порядке документа.' })
  items!: ProductDto[];
}

export class ErrorDto {
  @ApiProperty({ example: 422 }) statusCode!: number;
  @ApiProperty({ example: 'NO_PRODUCTS' }) code!: string;
  @ApiProperty({ example: 'Не удалось прочитать товарные строки' }) message!: string;
  @ApiProperty({ example: '/ai' }) path!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty() timestamp!: string;
}
