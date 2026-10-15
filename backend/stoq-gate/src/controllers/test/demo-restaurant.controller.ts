import { Body, Controller, ForbiddenException, Get, HttpException, Param, ParseIntPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from '../../auth/auth.service';
import { Public, Roles } from '../../auth/auth.decorators';
import { Role, type AuthSession } from '../../auth/auth.types';
import { accessTokenFrom } from '../../auth/access-token';
import { setAuthCookies } from '../../auth/auth.cookies';
import { ROUTING_KEYS } from '../../common/rabbitMQ/rabbitmq-topology';
import { DemoRestaurantService } from './demo-restaurant.service';

class DemoLoginDto {
  @ApiProperty({ enum: ['ADMIN', 'MANAGER', 'WAITER', 'STOREKEEPER'] })
  @IsIn(['ADMIN', 'MANAGER', 'WAITER', 'STOREKEEPER'])
  role!: 'ADMIN' | 'MANAGER' | 'WAITER' | 'STOREKEEPER';
}

@ApiTags('Тестовые данные')
@Controller('test')
@Roles(Role.ADMIN)
export class DemoRestaurantController {
  constructor(private readonly auth: AuthService, private readonly demo: DemoRestaurantService, private readonly config: ConfigService) {}

  private enabled() {
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_RESTAURANTS !== 'true' && process.env.ENABLE_TEST_TOOLS !== 'true')
      throw new ForbiddenException('Тестовый ресторан отключён. Для демо-ресторанов включите ENABLE_DEMO_RESTAURANTS в gateway и auth');
  }

  @Post('restaurant')
  @ApiOperation({ summary: 'Создать отдельный демо-ресторан, данные и по одному сотруднику каждой роли' })
  async create(@Req() req: Request) {
    this.enabled();
    const accessToken = accessTokenFrom(req.headers, req.cookies);
    const result = await this.auth.request<{ restaurant: { id: number; name: string }; accounts: unknown[] }>(
      ROUTING_KEYS.AUTH_CREATE_DEMO_RESTAURANT, { accessToken },
    );
    try {
      const data = await this.demo.seed(result.restaurant.id);
      await this.auth.request(ROUTING_KEYS.AUTH_COMPLETE_DEMO_RESTAURANT, { accessToken, restaurantId: result.restaurant.id });
      return { ...result, data, message: 'Тестовый ресторан создан и заполнен. Доступен вход под каждой ролью.' };
    } catch (error) {
      throw new HttpException({ message: 'Не удалось полностью заполнить тестовый ресторан. Он не будет доступен для тестового входа до завершения заполнения.',
        restaurantId: result.restaurant.id, reason: error instanceof Error ? error.message : 'Сервис недоступен' }, 503);
    }
  }

  @Public()
  @Get('restaurants')
  @ApiOperation({ summary: 'Готовые демо-рестораны и безопасные данные аккаунтов для тестового входа' })
  list() { this.enabled(); return this.auth.request(ROUTING_KEYS.AUTH_LIST_DEMO_RESTAURANTS, {}); }

  @Public()
  @Post('restaurants/:id/login')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Войти под ролью в готовый демо-ресторан' })
  async login(@Param('id', ParseIntPipe) restaurantId: number, @Body() dto: DemoLoginDto, @Res({ passthrough: true }) res: Response) {
    this.enabled();
    const session = await this.auth.request<AuthSession>(ROUTING_KEYS.AUTH_DEMO_LOGIN, { restaurantId, role: dto.role });
    const configured = String(this.config.get('COOKIE_SAMESITE', 'lax')).toLowerCase();
    const sameSite = configured === 'none' || configured === 'strict' ? configured : 'lax';
    setAuthCookies({ res, ...session, sameSite, secure: String(this.config.get('COOKIE_SECURE', 'false')) === 'true' });
    return { user: session.user };
  }
}
