import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { restaurantStorage } from './restaurant-context';

@Injectable()
export class RestaurantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    let id: number | undefined;
    if (context.getType() === 'http') {
      id = context.switchToHttp().getRequest().restaurantId;
    } else if (context.getType<string>() === 'rmq') {
      id = context.getArgByIndex(1)?.properties?.headers?.restaurantId;
      if (!Number.isSafeInteger(id) || (id ?? 0) < 1) {
        return of({ success: false, error: { status: 400, message: 'Не указан ресторан в RPC' } });
      }
    } else return next.handle();
    return new Observable(subscriber => restaurantStorage.run(id!, () => next.handle().subscribe(subscriber)));
  }
}
