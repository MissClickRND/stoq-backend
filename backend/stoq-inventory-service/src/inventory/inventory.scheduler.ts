import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InventoryService } from "./inventory.service";

@Injectable()
export class InventoryScheduler {
  private readonly logger = new Logger(InventoryScheduler.name);
  constructor(private inventoryService: InventoryService) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: "minute-expiration-check",
    waitForCompletion: true,
  })
  async handleMinuteExpirationCheck() {
    try {
      await this.inventoryService.processJustExpiredBatches();
    } catch (error) {
      this.logger.error("Ошибка проверки просроченных партий", error);
    }
  }
}
