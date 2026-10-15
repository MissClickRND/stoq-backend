import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { PUBLIC_KEY, ROLES_KEY, GUEST_KEY } from './auth.decorators';
import { FULL_ACCESS, type Role } from './auth.types';
import { accessTokenFrom } from './access-token';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // RabbitMQ event listeners use a separate transport; HTTP credentials are irrelevant there.
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets))
      return true;
    const req = context.switchToHttp().getRequest();
    const token = accessTokenFrom(req.headers, req.cookies);
    if (!token && this.reflector.getAllAndOverride<boolean>(GUEST_KEY, targets))
      return true;
    const user = await this.auth.verifyAccess(token);
    const roles =
      this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets) ??
      FULL_ACCESS;
    if (!roles.includes(user.role))
      throw new ForbiddenException('Недостаточно прав');
    req.user = user;
    return true;
  }
}
