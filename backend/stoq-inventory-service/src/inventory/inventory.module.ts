import { Module } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { InventoryController } from "./inventory.controller";
import { InventoryRPCController } from "./inventory-rpc.controller";

@Module({
  providers: [InventoryService, InventoryRPCController],
  controllers: [InventoryController],
})
export class InventoryModule {}
