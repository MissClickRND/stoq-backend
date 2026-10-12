import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { SuppliesModule } from "./supplies/supplies.module";
import { InventoryModule } from "./inventory/inventory.module";
import { CommandBusModule } from "./common/rabbitMQ/command-bus.module";

@Module({
  imports: [PrismaModule, SuppliesModule, InventoryModule, CommandBusModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
