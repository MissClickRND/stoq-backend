import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { concatMap } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(concatMap(async result => { await this.audit.record(req, result); return result; }));
  }
}
