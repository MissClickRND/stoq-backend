import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser, Role } from 'src/auth/types/auth-user.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;

    if (!user) throw new ForbiddenException('No user');

    const allowed = requiredRoles.includes(user.role);
    if (!allowed) throw new ForbiddenException('Forbidden');

    return true;
  }
}
