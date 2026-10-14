import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto';
import { clearAuthCookies, setAuthCookies } from './auth.cookies';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import type { Request, Response } from 'express';
import { parseDurationMs } from './utils/parse-duration-ms';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser, AuthUserWithRefresh } from './types/auth-user.type';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieSecure() {
    return (this.config.get<string>('COOKIE_SECURE') ?? 'false') === 'true';
  }

  private cookieSameSite(): 'lax' | 'strict' | 'none' {
    const v = (
      this.config.get<string>('COOKIE_SAMESITE') ?? 'lax'
    ).toLowerCase();
    if (v === 'none' || v === 'strict' || v === 'lax') return v;
    return 'lax';
  }

  private accessMaxAgeMs() {
    const v = this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m';
    return parseDurationMs(v);
  }

  private refreshMaxAgeMs() {
    const v = this.config.get<string>('JWT_REFRESH_EXPIRES') ?? '7d';
    return parseDurationMs(v);
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto);

    setAuthCookies({
      res,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      secure: this.cookieSecure(),
      sameSite: this.cookieSameSite(),
      accessMaxAgeMs: this.accessMaxAgeMs(),
      refreshMaxAgeMs: this.refreshMaxAgeMs(),
    });

    return { user: result.user };
  }

  @Post('login')
  @Public()
  async login(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto);

    setAuthCookies({
      res,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      secure: this.cookieSecure(),
      sameSite: this.cookieSameSite(),
      accessMaxAgeMs: this.accessMaxAgeMs(),
      refreshMaxAgeMs: this.refreshMaxAgeMs(),
    });

    return { user: result.user };
  }

  @Public()
  @ApiCookieAuth('accessToken')
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refresh(
    @CurrentUser() user: AuthUserWithRefresh,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.refreshTokens(
      user.id,
      user.refreshToken,
    );

    setAuthCookies({
      res,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      secure: this.cookieSecure(),
      sameSite: this.cookieSameSite(),
      accessMaxAgeMs: this.accessMaxAgeMs(),
      refreshMaxAgeMs: this.refreshMaxAgeMs(),
    });

    return { user: result.user };
  }

  @ApiCookieAuth('accessToken')
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.id);

    clearAuthCookies(res, {
      secure: this.cookieSecure(),
      sameSite: this.cookieSameSite(),
    });

    return { ok: true };
  }

  @ApiCookieAuth('accessToken')
  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return { authenticated: true, user };
  }
}
