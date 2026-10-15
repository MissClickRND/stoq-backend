ALTER TABLE inventory.batches ADD COLUMN disposed_at TIMESTAMPTZ(6);
ALTER TABLE inventory.stock_movements ADD COLUMN "actorId" INTEGER,
  ADD COLUMN "actorName" TEXT, ADD COLUMN "actorRole" TEXT;
