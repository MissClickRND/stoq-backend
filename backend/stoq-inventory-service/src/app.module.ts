import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { SuppliesModule } from "./supplies/supplies.module";
import { InventoryModule } from "./inventory/inventory.module";

@Module({
  imports: [PrismaModule, SuppliesModule, InventoryModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
