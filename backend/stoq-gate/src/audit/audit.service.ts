import { HttpException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CommandBusService } from '../common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';
import { activityEvent } from './activity-event';
import { restaurantId } from '../common/tenant/restaurant-context';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly bus: CommandBusService) {}

  async record(req: any, result: any) {
    const path = (req.path ?? req.url?.split('?')[0] ?? '').replace(/\/$/, '');
    const description = activityEvent(req.method, path, req.body, result);
    if (!description) return;
    const registration = ['/auth/register-user', '/auth/register-restaurant'].includes(path) ? result?.user : undefined;
    const tenant = req.restaurantId ?? registration?.restaurantId;
    if (!Number.isSafeInteger(tenant) || tenant < 1) return;
    const user = req.user ?? (registration ? { ...registration, fullName: registration.fullName ?? req.body?.fullName } : undefined);
    await this.append({ restaurantId: tenant,
      actor: user ? { id: user.id, fullName: user.fullName, role: user.role } : { id: null, fullName: 'Гость', role: 'GUEST' },
      event: { ...description, id: randomUUID() } });
  }

  async expiration(payload: any) {
    if (!Number.isSafeInteger(payload?.restaurantId) || !Number.isSafeInteger(payload?.batchId) ||
      !payload?.writtenOffAt || typeof payload.writtenOffQuantity !== 'number' || payload.writtenOffQuantity <= 0) return;
    await this.append({ restaurantId: payload.restaurantId, actor: { id: null, fullName: 'Система', role: 'SYSTEM' }, event: {
      id: `expiration:${payload.restaurantId}:${payload.batchId}`, action: 'automatic', category: 'Склад',
      title: 'Автоматически списана просроченная партия', description: 'Истёк срок годности продукта.',
      object: `${payload.product?.name ?? 'Продукт'} · партия №${payload.batchId}`,
      detail: `Списано: ${payload.writtenOffQuantity}${payload.product?.unit?.shortName ? ' ' + payload.product.unit.shortName : ''}`,
      timestamp: payload.writtenOffAt,
    } });
  }

  private async append(payload: any) {
    // Same event ID for retries: a late successful RPC cannot duplicate the log entry.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response: any = await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.AUTH_APPEND_ACTIVITY, payload);
        if (response?.success) return;
      } catch { /* Retry the same idempotent insert. */ }
    }
    this.logger.error(`Не удалось сохранить событие ${payload.event.id} ресторана ${payload.restaurantId}`);
  }

  async list(accessToken: string | undefined, cursor?: string) {
    if (!cursor) {
      // Reconcile committed expiry history, including events missed while the gateway was down.
      const history: any = await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_INVENTORY_WRITE_OFFS, {});
      if (!history?.success) throw new HttpException('Не удалось загрузить историю автоматического списания', 503);
      for (const row of history.data) {
        // restaurantId is the guard-verified request context, never an HTTP query parameter.
        await this.expiration({ ...row, restaurantId: restaurantId() });
      }
    }
    const response: any = await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.AUTH_GET_ACTIVITY, { accessToken, cursor });
    if (!response?.success) throw new HttpException(response?.error?.message ?? 'Журнал недоступен', response?.error?.status ?? 503);
    return response.data;
  }
}
