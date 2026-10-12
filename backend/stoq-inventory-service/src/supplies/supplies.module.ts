import { Module } from "@nestjs/common";
import { SupplyService } from "./supplies.service";
import { SupplyController } from "./supplies.controller";

@Module({
  providers: [SupplyService],
  controllers: [SupplyController],
})
export class SuppliesModule {}
