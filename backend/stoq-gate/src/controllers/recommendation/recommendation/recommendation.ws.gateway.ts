import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { CommandBusService } from 'src/common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from 'src/common/rabbitMQ/rabbitmq-topology';

import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiExtraModels,
} from '@nestjs/swagger';
import {
  WsSuccessResponseDto,
  WsErrorResponseDto,
  StopListUpdatedBroadcastDto,
  GetStopListRequestDto,
  GetDishRecommendationsRequestDto,
} from './dto/recommendation-ws.dto';

@ApiTags('Recommendations WebSocket')
@ApiExtraModels(
  WsSuccessResponseDto,
  WsErrorResponseDto,
  StopListUpdatedBroadcastDto,
)
@WebSocketGateway({
  namespace: '/recommendations',
  cors: {
    origin: '*',
  },
})
export class RecommendationsWsGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly commandBusService: CommandBusService) {}

  private handleRpcResponse<T>(response: any): T {
    if (!response.success) {
      throw new Error(response.error?.message ?? 'RPC error');
    }
    return response.data as T;
  }

  @ApiOperation({
    summary: 'Получить стоп-лист',
    description:
      'Отправьте событие `recommendations:getStopList`. ' +
      'Сервер ответит событием `recommendations:stopListResult` (успех) ' +
      'или `recommendations:error` (ошибка).',
  })
  @ApiBody({ type: GetStopListRequestDto })
  @SubscribeMessage('recommendations:getStopList')
  async getStopList(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GetStopListRequestDto,
  ) {
    const requestId = payload.requestId ?? randomUUID();

    try {
      const response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_RECOMMENDATION,
        { search: payload.search },
      );

      const data = this.handleRpcResponse(response);

      client.emit('recommendations:stopListResult', {
        requestId,
        data,
      });
    } catch (err) {
      client.emit('recommendations:error', {
        requestId,
        message: err instanceof Error ? err.message : 'ERROR',
      });
    }
  }

  @ApiOperation({
    summary: 'Получить рекомендации блюд',
    description:
      'Отправьте событие `recommendations:getDishRecommendations`. ' +
      'Сервер ответит событием `recommendations:dishRecommendationsResult` (успех) ' +
      'или `recommendations:error` (ошибка).',
  })
  @ApiBody({ type: GetDishRecommendationsRequestDto })
  @SubscribeMessage('recommendations:getDishRecommendations')
  async getDishRecommendations(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GetDishRecommendationsRequestDto,
  ) {
    const requestId = payload.requestId ?? randomUUID();

    try {
      const response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_DISH_RECOMMENDATION,
        {},
      );

      const data = this.handleRpcResponse(response);

      client.emit('recommendations:dishRecommendationsResult', {
        requestId,
        data,
      });
    } catch (err) {
      client.emit('recommendations:error', {
        requestId,
        message: err instanceof Error ? err.message : 'ERROR',
      });
    }
  }

  @ApiOperation({
    summary: 'Обновление стоп-листа (Server-to-Client)',
    description:
      'Событие рассылается сервером всем подключенным клиентам при изменении стоп-листа. ' +
      'Клиенту следует слушать событие `recommendations:stopListUpdated`.',
  })
  broadcastStopListUpdated(payload: StopListUpdatedBroadcastDto) {
    this.server.emit('recommendations:stopListUpdated', payload);
  }
}
