ALTER TABLE "ActivityLog" ADD COLUMN "stockMovementId" INTEGER;
CREATE UNIQUE INDEX "ActivityLog_restaurantId_stockMovementId_key" ON "ActivityLog"("restaurantId", "stockMovementId");
CREATE TABLE "ActivitySyncState" ("restaurantId" INTEGER PRIMARY KEY, "stockMovementId" INTEGER NOT NULL DEFAULT 0);
