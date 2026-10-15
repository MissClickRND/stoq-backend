import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ActivityEvent {
  id: string; action: string; category: string; title: string; description: string;
  object?: string; detail?: string; timestamp?: string;
  stockMovementId?: number;
  legacyId?: string;
}
export interface ActivityActor { id: number | null; fullName: string; role: string }

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(restaurantId: number, actor: ActivityActor, event: ActivityEvent) {
    if (!Number.isSafeInteger(restaurantId) || restaurantId < 1 || !actor?.fullName?.trim() ||
      !['ADMIN', 'MANAGER', 'WAITER', 'STOREKEEPER', 'WAIT_CONFIRM', 'GUEST', 'SYSTEM'].includes(actor.role) ||
      (actor.id != null && (!Number.isSafeInteger(actor.id) || actor.id < 1)) ||
      !event?.id || event.id.length > 150 ||
      !['create', 'update', 'delete', 'role', 'invite', 'automatic'].includes(event.action)) {
      throw new BadRequestException('Некорректное событие журнала');
    }
    for (const field of ['title', 'category', 'description'] as const) {
      if (typeof event[field] !== 'string' || !event[field].trim() || event[field].length > 2000)
        throw new BadRequestException('Некорректное описание события');
    }
    const date = event.timestamp ? new Date(event.timestamp) : new Date();
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('Некорректное время события');
    const stockMovementId = event.stockMovementId;
    if (stockMovementId != null && (!Number.isSafeInteger(stockMovementId) || stockMovementId < 1)) throw new BadRequestException('Некорректное движение склада');
    // Attach old HTTP/expiry records to their movement instead of duplicating historical entries.
    if (stockMovementId != null) {
      const existing = await this.prisma.activityLog.findFirst({ where: { restaurantId, stockMovementId } });
      if (existing) return existing;
      const legacy = event.action === 'automatic' || event.title === 'Списаны продукты' ? await this.prisma.activityLog.findFirst({ where: { restaurantId, stockMovementId: null, category: 'Склад',
        ...(event.action === 'automatic' ? { id: event.legacyId ?? 'NO_LEGACY_ID' } :
          { title: 'Списаны продукты', object: event.object, createdAt: { gte: new Date(date.getTime() - 2000), lte: new Date(date.getTime() + 120000) } }) }, orderBy: { createdAt: 'asc' } }) : null;
      if (legacy) return this.prisma.activityLog.update({ where: { id: legacy.id }, data: { stockMovementId } });
    }
    return this.prisma.activityLog.upsert({ where: stockMovementId == null ? { id: event.id } : { restaurantId_stockMovementId: { restaurantId, stockMovementId } }, update: {}, create: {
      id: event.id, restaurantId, authorId: actor.id, authorName: actor.fullName, authorRole: actor.role,
      stockMovementId: stockMovementId ?? null,
      action: event.action, category: event.category, title: event.title, description: event.description,
      object: event.object?.slice(0, 1000) ?? null, detail: event.detail?.slice(0, 1000) ?? null, createdAt: date,
    } });
  }

  async stockCursor(restaurantId: number, afterId?: number) {
    if (afterId != null) {
      if (!Number.isSafeInteger(afterId) || afterId < 0) throw new BadRequestException('Некорректный курсор движений');
      await this.prisma.activitySyncState.upsert({ where: { restaurantId }, create: { restaurantId, stockMovementId: 0 }, update: {} });
      await this.prisma.activitySyncState.updateMany({ where: { restaurantId, stockMovementId: { lt: afterId } }, data: { stockMovementId: afterId } });
    }
    return { stockCursor: (await this.prisma.activitySyncState.findUnique({ where: { restaurantId } }))?.stockMovementId ?? 0 };
  }

  async list(restaurantId: number, cursor?: string) {
    let before: { date: Date; id: string } | undefined;
    if (cursor !== undefined) {
      try {
        if (typeof cursor !== 'string' || cursor.length > 600) throw new Error();
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        const date = new Date(decoded.date);
        if (typeof decoded.id !== 'string' || !decoded.id || decoded.id.length > 150 || !Number.isFinite(date.getTime())) throw new Error();
        before = { date, id: decoded.id };
      } catch { throw new BadRequestException('Некорректный курсор журнала'); }
    }
    const records = await this.prisma.activityLog.findMany({ where: { restaurantId,
      ...(before ? { OR: [{ createdAt: { lt: before.date } }, { createdAt: before.date, id: { lt: before.id } }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31 });
    const page = records.slice(0, 30);
    const last = page.at(-1);
    return { items: page.map(row => ({ id: row.id, action: row.action,
      author: { id: row.authorId, name: row.authorName, role: row.authorRole },
      category: row.category, title: row.title, description: row.description, object: row.object,
      detail: row.detail, timestamp: row.createdAt.toISOString() })),
      nextCursor: records.length > 30 && last ? Buffer.from(JSON.stringify({ date: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null };
  }
}
