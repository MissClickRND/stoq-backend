import { Module } from "@nestjs/common";
import { SupplyService } from "./supplies.service";
import { SupplyController } from "./supplies.controller";
import { SupplyRPCController } from "./supplies-rpc.controller";
import { CommandBusModule } from "../common/rabbitMQ/command-bus.module";

@Module({
  imports: [CommandBusModule],
  providers: [SupplyService, SupplyRPCController],
  controllers: [SupplyController],
})
export class SuppliesModule {}
