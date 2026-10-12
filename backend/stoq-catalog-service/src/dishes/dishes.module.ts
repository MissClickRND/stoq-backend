import { Module } from "@nestjs/common";
import { DishesService } from "./dishes.service";
import { DishesController } from "./dishes.controller";
import { DishesRPCController } from "./dishes-rpc.controller";
import { CommandBusModule } from "src/common/rabbitMQ/command-bus.module";

@Module({
  imports: [CommandBusModule],
  providers: [DishesService, DishesRPCController],
})
export class DishesModule {}
