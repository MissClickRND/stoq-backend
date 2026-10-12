import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import { Injectable } from "@nestjs/common";
import { EXCHANGES, QUEUES, ROUTING_KEYS } from "src/common/rabbitMQ/rabbitmq-topology";
import { executeRpc } from "src/common/utils/rpc-handler";
import { RecipesService } from "./recipes.service";
import { CreateRecipeDto } from "./dto/create-recipe.dto";
import { AddRecipeItemsDto } from "./dto/add-recipe-item.dto";

@Injectable()
export class RecipesRPCController {
  constructor(private readonly recipesService: RecipesService) {}

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_RECIPES,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findAll() {
    return executeRpc(() => this.recipesService.findAll());
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.GET_RECIPES_BY_ID,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  findOne(payload: { id: number }) {
    return executeRpc(() => this.recipesService.findOne(payload.id));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.CREATE_RECIPES,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  create(payload: { dto: CreateRecipeDto }) {
    return executeRpc(() => this.recipesService.create(payload.dto));
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.ADD_ITEM_TO_RECIPES,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  addItems(payload: { recipeId: number; dto: AddRecipeItemsDto }) {
    return executeRpc(() =>
      this.recipesService.addItems(payload.recipeId, payload.dto),
    );
  }

  @RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    routingKey: ROUTING_KEYS.DEL_RECIPES_BY_ID,
    queue: QUEUES.CATALOG_COMMANDS,
  })
  remove(payload: { recipeId: number }) {
    return executeRpc(() => this.recipesService.remove(payload.recipeId));
  }
}
