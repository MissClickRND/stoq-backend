import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public, Roles } from './auth.decorators';
import { Role, STAFF, type AuthSession, type AuthUser } from './auth.types';
import { ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';
import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { LoginDto } from './dto/login.dto';
import { ApproveUserDto } from './dto/approve-user.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { clearAuthCookies, setAuthCookies } from './auth.cookies';
import { accessTokenFrom } from './access-token';

@ApiTags('auth')
@Roles(Role.ADMIN)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions() {
    const value = String(
      this.config.get('COOKIE_SAMESITE', 'lax'),
    ).toLowerCase();
    const sameSite = value === 'strict' || value === 'none' ? value : 'lax';
    return {
      secure: String(this.config.get('COOKIE_SECURE', 'false')) === 'true',
      sameSite,
    } as const;
  }

  private setSession(res: Response, session: AuthSession) {
    setAuthCookies({
      res,
      ...this.cookieOptions(),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessMaxAgeMs: session.accessMaxAgeMs,
      refreshMaxAgeMs: session.refreshMaxAgeMs,
    });
    return { user: session.user };
  }

  @Public()
  @Post('register-user')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Зарегистрировать сотрудника на подтверждение администратору',
  })
  register(@Body() dto: RegisterUserDto) {
    return this.auth.request(ROUTING_KEYS.AUTH_REGISTER_USER, { dto });
  }

  @Public()
  @Post('register-restaurant')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Создать ресторан и аккаунт администратора' })
  registerRestaurant(@Body() dto: RegisterRestaurantDto) {
    return this.auth.request(ROUTING_KEYS.AUTH_REGISTER_RESTAURANT, { dto });
  }

  @Public()
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Войти; токены устанавливаются в HttpOnly cookies' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.setSession(
      res,
      await this.auth.request<AuthSession>(ROUTING_KEYS.AUTH_LOGIN, { dto }),
    );
  }

  @Public()
  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Обновить сессию по refreshToken cookie' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken: unknown = req.cookies?.refreshToken;
    if (typeof refreshToken !== 'string' || !refreshToken)
      throw new UnauthorizedException('Отсутствует refresh-токен');
    return this.setSession(
      res,
      await this.auth.request<AuthSession>(ROUTING_KEYS.AUTH_REFRESH, {
        refreshToken,
      }),
    );
  }

  @Roles(...STAFF)
  @Post('logout')
  @ApiOperation({ summary: 'Завершить сессию и удалить cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.request(ROUTING_KEYS.AUTH_LOGOUT, {
      accessToken: accessTokenFrom(req.headers, req.cookies),
    });
    clearAuthCookies(res, this.cookieOptions());
    return { ok: true };
  }

  @Roles(...STAFF)
  @Get('status')
  @ApiOperation({ summary: 'Текущий пользователь, роль и ID ресторана' })
  status(@Req() req: Request & { user: AuthUser }) {
    return { authenticated: true, user: req.user };
  }

  @Get('admin/users/pending')
  @ApiOperation({
    summary: 'Сотрудники своего ресторана, ожидающие подтверждения',
  })
  pending(@Req() req: Request) {
    return this.auth.request(ROUTING_KEYS.AUTH_PENDING_USERS, {
      accessToken: accessTokenFrom(req.headers, req.cookies),
    });
  }

  @Patch('admin/users/:id/approve')
  @ApiOperation({ summary: 'Подтвердить сотрудника и назначить роль' })
  approve(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveUserDto,
  ) {
    return this.auth.request(ROUTING_KEYS.AUTH_APPROVE_USER, {
      accessToken: accessTokenFrom(req.headers, req.cookies),
      id,
      dto,
    });
  }

  @Delete('admin/users/:id')
  @ApiOperation({ summary: 'Удалить сотрудника своего ресторана' })
  delete(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.auth.request(ROUTING_KEYS.AUTH_DELETE_USER, {
      accessToken: accessTokenFrom(req.headers, req.cookies),
      id,
    });
  }

  @Patch('admin/restaurant')
  @ApiOperation({ summary: 'Изменить информацию о своём ресторане' })
  updateRestaurant(@Req() req: Request, @Body() dto: UpdateRestaurantDto) {
    return this.auth.request(ROUTING_KEYS.AUTH_UPDATE_RESTAURANT, {
      accessToken: accessTokenFrom(req.headers, req.cookies),
      dto,
    });
  }
}
