import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
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
import { CreateInvitationDto, SetUserBlockDto, SetUserRoleDto } from './dto/admin.dto';

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

  @Get('admin/statistics')
  @ApiOperation({ summary: 'Статистика сотрудников и приглашений своего ресторана' })
  statistics(@Req() req: Request) {
    return this.auth.request(ROUTING_KEYS.AUTH_ADMIN_STATISTICS, { accessToken: accessTokenFrom(req.headers, req.cookies) });
  }

  @Get('admin/users')
  @ApiOperation({ summary: 'Все сотрудники своего ресторана и их статусы' })
  users(@Req() req: Request) {
    return this.auth.request(ROUTING_KEYS.AUTH_ADMIN_USERS, { accessToken: accessTokenFrom(req.headers, req.cookies) });
  }

  @Get('admin/restaurant')
  @ApiOperation({ summary: 'Информация о своём ресторане' })
  restaurant(@Req() req: Request) {
    return this.auth.request(ROUTING_KEYS.AUTH_ADMIN_RESTAURANT, { accessToken: accessTokenFrom(req.headers, req.cookies) });
  }

  @Patch('admin/users/:id/role')
  @ApiOperation({ summary: 'Назначить роль сотруднику своего ресторана' })
  setUserRole(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Body() dto: SetUserRoleDto) {
    return this.auth.request(ROUTING_KEYS.AUTH_SET_USER_ROLE, { accessToken: accessTokenFrom(req.headers, req.cookies), id, dto });
  }

  @Patch('admin/users/:id/block')
  @ApiOperation({ summary: 'Заблокировать или разблокировать сотрудника' })
  setUserBlock(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Body() dto: SetUserBlockDto) {
    return this.auth.request(ROUTING_KEYS.AUTH_SET_USER_BLOCK, { accessToken: accessTokenFrom(req.headers, req.cookies), id, dto });
  }

  @Get('admin/invitations')
  @ApiOperation({ summary: 'Приглашения в свой ресторан' })
  invitations(@Req() req: Request) {
    return this.auth.request(ROUTING_KEYS.AUTH_LIST_INVITATIONS, { accessToken: accessTokenFrom(req.headers, req.cookies) });
  }

  @Post('admin/invitations')
  @ApiOperation({ summary: 'Создать одноразовое приглашение сотрудника' })
  createInvitation(@Req() req: Request, @Body() dto: CreateInvitationDto) {
    return this.auth.request(ROUTING_KEYS.AUTH_CREATE_INVITATION, { accessToken: accessTokenFrom(req.headers, req.cookies), dto });
  }

  @Patch('admin/invitations/:id/revoke')
  @ApiOperation({ summary: 'Отозвать приглашение своего ресторана' })
  revokeInvitation(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.request(ROUTING_KEYS.AUTH_REVOKE_INVITATION, { accessToken: accessTokenFrom(req.headers, req.cookies), id });
  }

  @Delete('admin/invitations/:id')
  @ApiOperation({ summary: 'Удалить приглашение своего ресторана' })
  deleteInvitation(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.request(ROUTING_KEYS.AUTH_DELETE_INVITATION, { accessToken: accessTokenFrom(req.headers, req.cookies), id });
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
