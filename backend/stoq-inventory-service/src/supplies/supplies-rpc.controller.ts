import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { CreateSupplyDto } from "./dto/requests/create-supply.dto";
import { SupplyService } from "./supplies.service";
import { EXCHANGES, ROUTING_KEYS, QUEUES } from "../common/rabbitMQ/rabbitmq-topology";
import { executeRpc } from "../common/utils/rpc-handler";

@Injectable()
export class SupplyRPCController {
  constructor(private readonly supplyService: SupplyService) {}

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.RESET_INVENTORY_DATA, queue: QUEUES.INVENTORY_COMMANDS })
  reset(payload: { confirmation: string }) {
    return executeRpc(() => this.supplyService.resetBusinessData(payload.confirmation));
  }

  @RabbitRPC({ exchange: EXCHANGES.COMMANDS, routingKey: ROUTING_KEYS.UPDATE_SUPPLY, queue: QUEUES.INVENTORY_COMMANDS })
  update(payload: { id: number; dto: CreateSupplyDto }) {
    return executeRpc(() => this.supplyService.updateSupply(payload.id, payload.dto));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CREATE_SUPPLY,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  async create(payload: { dto: CreateSupplyDto }) {
    return executeRpc(() => this.supplyService.createSupply(payload.dto));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_SUPPLY,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  async findAll(payload: {search?: string}) {
    return executeRpc(() => this.supplyService.findAll(payload.search));
  }
  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_SUPPLY_BY_ID,
    queue: QUEUES.INVENTORY_COMMANDS,
  })
  async findOne(payload: { id: number}) {
    return executeRpc(() => this.supplyService.findOne(payload.id));
  }
}
