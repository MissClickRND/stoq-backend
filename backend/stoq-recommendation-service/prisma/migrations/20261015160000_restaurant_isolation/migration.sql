ALTER TABLE "StopListItem" ADD COLUMN IF NOT EXISTS "restaurantId" INTEGER;
CREATE INDEX IF NOT EXISTS "StopListItem_restaurantId_idx" ON "StopListItem"("restaurantId");
