export class WsSuccessResponseDto<T = any> {
  requestId!: string;
  data!: T;
}

export class WsErrorResponseDto {
  requestId!: string;
  message!: string;
}

export class GetStockRequestDto {
  requestId?: string;
  productIds!: number[];
}

export class GetExpiringSoonRequestDto {
  requestId?: string;
  daysThreshold?: number;
}