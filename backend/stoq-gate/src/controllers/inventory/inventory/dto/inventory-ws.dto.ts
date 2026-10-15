import { ArrayUnique, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { InventoryResponseDto, ProductResponseDto } from '../../../../common/dto/business-response.dto';

export class WsSuccessResponseDto<T = any> {
  requestId!: string;
  data!: T;
}

export class WsErrorResponseDto {
  requestId!: string;
  message!: string;
}

export class GetStockRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;

  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  productIds!: number[];
}

export class GetExpiringSoonRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  daysThreshold?: number;
}
export interface StockChangedEvent {
  eventId: string;
  reason: string;
  occurredAt: string;
  batchIds?: number[];
  productIds?: number[];
  supplyId?: number;
}

export interface BatchExpiredEvent {
  eventId: string;
  occurredAt: string;
  batchId: number;
  productId: number;
  lostQuantity: string;
  expiredAt: string;
}

export interface InventoryNotification {
  productId: number | null;
  productName: string | null;
  problem: string;
  message: string;
  severity: 'info' | 'warning';
}

export interface StockChangedNotificationEvent extends StockChangedEvent {
  /** The unfiltered response body of GET /inventory. */
  data: InventoryResponseDto[];
  problem: string;
  message: string;
  notifications: InventoryNotification[];
}

export interface BatchExpiredNotificationEvent extends BatchExpiredEvent, InventoryNotification {
  productId: number;
  productName: string;
  product: ProductResponseDto | null;
}
