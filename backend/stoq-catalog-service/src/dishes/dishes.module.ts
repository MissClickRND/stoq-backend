import { Module } from "@nestjs/common";
import { DishesService } from "./dishes.service";
import { DishesController } from "./dishes.controller";
import { DishesRPCController } from "./dishes-rpc.controller";

@Module({
  providers: [DishesService, DishesRPCController],
  controllers: [DishesController],
})
export class DishesModule {}
