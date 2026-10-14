import { ApiProperty } from '@nestjs/swagger';

export class GetStopListRequestDto {
  @ApiProperty({
    required: false,
    description: 'Уникальный идентификатор запроса (если не передан, будет сгенерирован)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  requestId?: string;

  @ApiProperty({
    required: false,
    description: 'Поисковый запрос для фильтрации стоп-листа',
    example: 'пицца',
  })
  search?: string;
}

export class GetDishRecommendationsRequestDto {
  @ApiProperty({
    required: false,
    description: 'Уникальный идентификатор запроса',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  requestId?: string;
}

export class WsSuccessResponseDto<T = any> {
  @ApiProperty({ description: 'Идентификатор запроса, соответствующий отправленному' })
  requestId!: string;

  @ApiProperty({ description: 'Полезные данные ответа' })
  data!: T;
}

export class WsErrorResponseDto {
  @ApiProperty({ description: 'Идентификатор запроса, в котором произошла ошибка' })
  requestId!: string;

  @ApiProperty({ description: 'Сообщение об ошибке' })
  message!: string;
}

export class StopListUpdatedBroadcastDto {
  @ApiProperty({ description: 'Данные обновленного стоп-листа' })
  data: any;
}