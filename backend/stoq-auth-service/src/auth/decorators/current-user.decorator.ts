import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser, AuthUserWithRefresh } from 'src/auth/types/auth-user.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | AuthUserWithRefresh => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.user as any;
  },
);
