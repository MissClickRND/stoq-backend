import { Injectable, ForbiddenException } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { AuditService, type ActivityActor, type ActivityEvent } from './audit.service';
import { AuthService } from './auth.service';
import { EXCHANGES, QUEUES, ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';
import { executeRpc } from '../common/utils/rpc-handler';

@Injectable()
export class AuditRPCController {
  constructor(private readonly audit: AuditService, private readonly auth: AuthService) {}

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, queue: QUEUES.AUTH_COMMANDS, routingKey: ROUTING_KEYS.AUTH_APPEND_ACTIVITY })
  append(payload: { restaurantId: number; actor: ActivityActor; event: ActivityEvent }) {
    return executeRpc(async () => {
      await this.audit.append(payload.restaurantId, payload.actor, payload.event);
      return { ok: true };
    });
  }

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, queue: QUEUES.AUTH_COMMANDS, routingKey: ROUTING_KEYS.AUTH_GET_ACTIVITY })
  list(payload: { accessToken: string; cursor?: string }) {
    return executeRpc(async () => {
      const user = await this.auth.verifyAccessToken(payload?.accessToken);
      if (!['ADMIN', 'MANAGER'].includes(user.role)) throw new ForbiddenException('Недостаточно прав');
      return this.audit.list(user.restaurantId, payload.cursor);
    });
  }
}
