import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

type PaginatedShape = { data: unknown; meta: unknown };
function isPaginatedShape(x: any): x is PaginatedShape {
  return x && typeof x === 'object' && 'data' in x && 'meta' in x;
}

//? Интерцептор для оборачивания всех ответов в единый формат { success, timestamp, data, meta? }

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();

    return next.handle().pipe(
      map((result) => {
        const timestamp = Date.now();

        // Если сервис вернул { data, meta } — разворачиваем
        if (isPaginatedShape(result)) {
          return {
            success: true,
            timestamp,
            data: result.data,
            meta: result.meta,
          };
        }

        return {      
          data: result,
        };
      }),
    );
  }
}
