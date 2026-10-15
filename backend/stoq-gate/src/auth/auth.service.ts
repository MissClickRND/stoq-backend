import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBusService } from '../common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';
import { Role, type AuthUser } from './auth.types';

@Injectable()
export class AuthService {
  private readonly timeoutMs: number;

  constructor(
    private readonly bus: CommandBusService,
    config: ConfigService,
  ) {
    this.timeoutMs = Number(config.get('AUTH_RPC_TIMEOUT_MS', 10000));
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 120000
    ) {
      throw new Error('Некорректная конфигурация AUTH_RPC_TIMEOUT_MS');
    }
  }

  async request<T>(routingKey: string, payload: unknown): Promise<T> {
    let response: any;
    try {
      response = await this.bus.sendCommand(
        EXCHANGES.COMMANDS,
        routingKey,
        payload,
        { timeoutMs: this.timeoutMs },
      );
    } catch {
      throw new ServiceUnavailableException('Auth-сервис недоступен');
    }
    if (response?.success === true) return response.data as T;
    if (response?.success === false && response.error) {
      const status = Number(response.error.status);
      throw new HttpException(
        { message: response.error.message ?? 'Ошибка auth-сервиса' },
        Number.isInteger(status) && status >= 400 && status <= 599
          ? status
          : 502,
      );
    }
    throw new HttpException('Некорректный ответ auth-сервиса', 502);
  }

  async verifyAccess(accessToken: string | undefined): Promise<AuthUser> {
    if (!accessToken) throw new UnauthorizedException('Требуется вход');
    const user = await this.request<AuthUser>(ROUTING_KEYS.AUTH_VERIFY_ACCESS, {
      accessToken,
    });
    if (
      !user ||
      !Number.isSafeInteger(user.id) ||
      !Number.isSafeInteger(user.restaurantId) ||
      !Object.values(Role).includes(user.role) ||
      user.role === Role.WAIT_CONFIRM
    ) {
      throw new UnauthorizedException('Сессия недействительна');
    }
    return user;
  }
}
