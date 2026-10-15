import { AsyncLocalStorage } from 'node:async_hooks';
import { BadRequestException } from '@nestjs/common';

export const restaurantStorage = new AsyncLocalStorage<number>();
export function restaurantId(): number {
  const id = restaurantStorage.getStore();
  if (!Number.isSafeInteger(id) || (id ?? 0) < 1) throw new BadRequestException('Не указан ресторан');
  return id!;
}
export const restaurantRoom = (id: number) => `restaurant:${id}`;
