import { Module } from "@nestjs/common";
import { RecipesService } from "./recipes.service";
import { RecipesController } from "./recipes.controller";
import { RecipesRPCController } from "./recipes-rpc.controller";

@Module({
  providers: [RecipesService, RecipesRPCController],
  // controllers: [RecipesController],
})
export class RecipesModule {}
