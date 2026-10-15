import { SetMetadata } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiSecurity,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { applyDecorators } from '@nestjs/common';
import type { Role } from './auth.types';

export const PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const GUEST_KEY = 'auth:guest';
export const Public = () =>
  applyDecorators(SetMetadata(PUBLIC_KEY, true), ApiSecurity({}));
export const AllowGuest = () =>
  applyDecorators(SetMetadata(GUEST_KEY, true), ApiSecurity({}));
export const Roles = (...roles: Role[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiCookieAuth('accessToken'),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Требуется вход' }),
    ApiForbiddenResponse({ description: 'Недостаточно прав' }),
  );
