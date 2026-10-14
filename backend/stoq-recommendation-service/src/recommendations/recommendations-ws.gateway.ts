import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/recommendations',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RecommendationsWsGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RecommendationsWsGateway.name);

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
    this.logger.log(`Namespace: /recommendations`);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('recommendations:getSnapshot')
  async handleGetSnapshot(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { search?: string },
  ) {

    client.emit('recommendations:snapshot', {
      message: 'Subscribe to recommendations:updated instead',
    });
  }

  emitUpdate(payload: any): void {
    this.logger.debug('Emitting update to all clients');
    this.server.emit('recommendations:updated', payload);
  }
}