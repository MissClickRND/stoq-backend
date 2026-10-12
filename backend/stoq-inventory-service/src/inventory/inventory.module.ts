import { Module } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { InventoryController } from "./inventory.controller";
import { InventoryRPCController } from "./inventory-rpc.controller";
import { CommandBusModule } from "../common/rabbitMQ/command-bus.module";

@Module({
  imports: [CommandBusModule],
  providers: [InventoryService, InventoryRPCController],
  controllers: [InventoryController],
})
export class InventoryModule {}
