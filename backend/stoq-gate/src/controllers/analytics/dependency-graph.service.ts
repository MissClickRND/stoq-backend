import { BadGatewayException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CommandBusService } from '../../common/rabbitMQ/command-bus.service';
import { EXCHANGES, ROUTING_KEYS } from '../../common/rabbitMQ/rabbitmq-topology';

@Injectable()
export class DependencyGraphService {
  constructor(private readonly commandBusService: CommandBusService) {}
  async getGraph() {
    let response: any;
    try {
      response = await this.commandBusService.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_DEPENDENCY_GRAPH, {});
    } catch {
      throw new ServiceUnavailableException('Recommendation-service недоступен. Повторите попытку');
    }
    if (!response?.success) {
      throw new HttpException(response?.error?.message ?? 'Не удалось загрузить граф зависимостей', response?.error?.status ?? 502);
    }
    if (!Array.isArray(response.data?.nodes) || !Array.isArray(response.data?.edges)) {
      throw new BadGatewayException('Recommendation-service вернул некорректный граф');
    }
    return response.data;
  }
}
