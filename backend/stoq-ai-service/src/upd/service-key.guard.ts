import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { timingSafeEqual, createHash } from 'node:crypto';
import { Request } from 'express';
import { SETTINGS, Settings } from '../config/environment';
import { ApiError } from '../common/api-error';

@Injectable()
export class ServiceKeyGuard implements CanActivate {
  constructor(@Inject(SETTINGS) private readonly settings: Settings) {}
  canActivate(context: ExecutionContext): boolean {
    if (!this.settings.SERVICE_API_KEY) return true;
    const provided = context.switchToHttp().getRequest<Request>().header('X-Service-Key') ?? '';
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(hash(provided), hash(this.settings.SERVICE_API_KEY))) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Неверный или отсутствующий X-Service-Key');
    }
    return true;
  }
}
