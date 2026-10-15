import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InventoryService } from "./inventory.service";

@Injectable()
export class InventoryScheduler {
  constructor(private inventoryService: InventoryService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: "minute-expiration-check" })
  async handleMinuteExpirationCheck() {
    try {
      await this.inventoryService.processJustExpiredBatches();
    } catch (error) {}
  }
}
