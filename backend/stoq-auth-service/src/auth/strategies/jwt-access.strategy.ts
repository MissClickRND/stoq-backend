import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthUser, Role } from 'src/auth/types/auth-user.type';
import { PrismaService } from 'src/prisma/prisma.service';

function cookieExtractorAccess(req: Request): string | null {
  return req?.cookies?.accessToken ?? null;
}

type JwtAccessPayload = {
  sub: number;
  email: string;
  role: Role;
  tokenVersion: number;
};

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractorAccess]),
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        tokenVersion: true,
      },
    });

    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Token expired');
    }

    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
