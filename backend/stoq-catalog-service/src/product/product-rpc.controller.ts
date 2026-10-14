import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { ProductService } from "./product.service";
import { CreateProductDto } from "./dto/request/create-product.dto";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "src/common/rabbitMQ/rabbitmq-topology";
import { executeRpc } from "src/common/utils/rpc-handler";
import { CreateUnitDto } from "./dto/request/create-unit.dto";
import { UpdProductRow } from "./upd-products";

@Injectable()
export class ProductRPCController {
  constructor(private readonly productService: ProductService) {}

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.RESOLVE_UPD_PRODUCTS,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  resolveUpdProducts(payload: { items: UpdProductRow[] }) {
    return executeRpc(() => this.productService.resolveUpdProducts(payload));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_PRODUCT,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findAll(payload: { search?: string }) {
    return executeRpc(() => this.productService.findAll(payload?.search));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_PRODUCT_BY_ID,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findOne(payload: { id: number }) {
    return executeRpc(() => this.productService.findOne(payload.id));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CREATE_PRODUCT,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  create(payload: CreateProductDto) {
    return executeRpc(() => this.productService.create(payload));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CREATE_MANY_PRODUCT,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  createMany(payload: CreateProductDto[]) {
    return executeRpc(() => this.productService.createMany(payload));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.DEL_PRODUCT_BY_ID,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  remove(payload: { id: number }) {
    return executeRpc(() => this.productService.remove(payload.id));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CREATE_UNIT,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  createUnit(payload: { dto: CreateUnitDto }) {
    return executeRpc(() => this.productService.createUnit(payload.dto));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_UNIT,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findAllUnits() {
    return executeRpc(() => this.productService.findAllUnits());
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_UNIT_BY_ID,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findOneUnit(payload: { id: number }) {
    return executeRpc(() => this.productService.findOneUnit(payload.id));
  }
}
