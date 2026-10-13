-- Historical item prices cannot be reconstructed from the current menu.
ALTER TABLE "OrderItem"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "imageURL" TEXT,
  ADD COLUMN "price" DECIMAL(18, 2);
