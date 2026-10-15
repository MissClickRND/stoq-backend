ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "restaurantId" INTEGER;
CREATE INDEX IF NOT EXISTS "Order_restaurantId_idx" ON "Order"("restaurantId");
