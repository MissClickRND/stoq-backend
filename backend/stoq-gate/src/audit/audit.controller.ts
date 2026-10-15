import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators';
import { FULL_ACCESS } from '../auth/auth.types';
import { accessTokenFrom } from '../auth/access-token';
import { AuditService } from './audit.service';

@ApiTags('Журнал действий')
@Controller('logs')
@Roles(...FULL_ACCESS)
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get()
  @ApiOperation({ summary: 'Последние 30 действий своего ресторана, cursor для следующей страницы' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  list(@Req() req: any, @Query('cursor') cursor?: string) {
    return this.audit.list(accessTokenFrom(req.headers, req.cookies), cursor);
  }
}
