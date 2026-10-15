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
      event: { ...description, id: randomUUID(), stockMovementId: result?.movementId } });
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

  private async append(payload: any, required = false) {
    // Same event ID for retries: a late successful RPC cannot duplicate the log entry.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response: any = await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.AUTH_APPEND_ACTIVITY, payload);
        if (response?.success) return;
      } catch { /* Retry the same idempotent insert. */ }
    }
    this.logger.error(`Не удалось сохранить событие ${payload.event.id} ресторана ${payload.restaurantId}`);
    if (required) throw new HttpException('Не удалось сохранить движение в журнал', 503);
  }

  async list(accessToken: string | undefined, cursor?: string) {
    if (!cursor) {
      const state: any = await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.AUTH_GET_ACTIVITY, { accessToken, source: 'STOCK' });
      if (!state?.success) throw new HttpException('Не удалось получить курсор журнала', 503);
      let afterId = state.data.stockCursor;
      const orderAuthors = new Map<string, any>();
      for (;;) {
        const history: any = await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_STOCK_MOVEMENT_HISTORY, { afterId });
        if (!history?.success) throw new HttpException('Не удалось загрузить движения склада', 503);
        for (const row of history.data.items) {
          const automatic = row.orderId === 'SYSTEM_EXPIRATION' || row.type === 'SYSTEM_EXPIRATION';
          const order = row.type === 'DEDUCTION';
          let actor = row.actor;
          if (!actor?.name && order && /^[1-9]\d*$/.test(row.orderId)) {
            if (!orderAuthors.has(row.orderId)) {
              try {
                const response: any = await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_ORDER_BY_ID, { id: Number(row.orderId) });
                orderAuthors.set(row.orderId, response?.success ? response.data?.createdBy : null);
              } catch { orderAuthors.set(row.orderId, null); }
            }
            const creator = orderAuthors.get(row.orderId);
            if (creator?.name) actor = { id: creator.id, name: creator.name, role: creator.role ?? (creator.source === 'GUEST' ? 'GUEST' : 'SYSTEM') };
          }
          const author = actor?.name ? { id: actor.id, fullName: actor.name, role: actor.role ?? 'SYSTEM' }
            : { id: null, fullName: automatic ? 'Система' : 'Не указан', role: 'SYSTEM' };
          await this.append({ restaurantId: restaurantId(), actor: author, event: {
            id: `stock:${restaurantId()}:${row.id}`, stockMovementId: row.id, timestamp: row.timestamp,
            legacyId: automatic ? `expiration:${restaurantId()}:${row.batchId}` : undefined,
            action: automatic ? 'automatic' : 'update', category: 'Склад',
            title: automatic ? 'Автоматически списана просроченная партия' : order ? 'Списаны ингредиенты заказа' : row.type === 'INVENTORY_ADJUSTMENT' ? 'Уменьшен остаток при инвентаризации' : 'Списаны продукты',
            description: order ? `Расход ингредиентов по заказу №${row.orderId}.` : 'Уменьшен сохранённый остаток склада.',
            object: order ? `${row.product.name} · партия №${row.batchId}` : `Партия №${row.batchId}`,
            detail: `${row.product.name}: списано ${Math.abs(row.quantity)} ${row.product.unit?.shortName ?? ''}`,
          } }, true);
          afterId = row.id;
        }
        if (history.data.items.length) {
          const saved: any = await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.AUTH_GET_ACTIVITY, { accessToken, source: 'STOCK', afterId });
          if (!saved?.success) throw new HttpException('Не удалось сохранить курсор журнала', 503);
        }
        if (!history.data.hasMore) break;
      }
    }
    const response: any = await this.bus.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.AUTH_GET_ACTIVITY, { accessToken, cursor });
    if (!response?.success) throw new HttpException(response?.error?.message ?? 'Журнал недоступен', response?.error?.status ?? 503);
    return response.data;
  }
}
