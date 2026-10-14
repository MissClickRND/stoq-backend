import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthUserWithRefresh } from 'src/auth/types/auth-user.type';

function cookieExtractorRefresh(req: Request): string | null {
  return req?.cookies?.refreshToken ?? null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractorRefresh]),
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET')!,
      passReqToCallback: true, // чтобы в validate пришёл req
    });
  }

  async validate(
    req: Request,
    payload: { sub: number; email: string },
  ): Promise<AuthUserWithRefresh> {
    const refreshToken = req.cookies?.refreshToken;
    return {
      id: payload.sub,
      email: payload.email,
      refreshToken,
      role: 'CUSTOMER',
    };
  }
}
