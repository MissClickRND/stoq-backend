import { Module } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { OrdersController } from "./orders.controller";
import { OrdersRPCController } from "./orders-rpc.controller";

@Module({
  providers: [OrdersService, OrdersRPCController],
  // controllers: [OrdersController],
})
export class OrdersModule {}
