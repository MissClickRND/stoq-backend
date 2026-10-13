ALTER TABLE "Order" ADD COLUMN date TIMESTAMPTZ(6), ADD COLUMN type TEXT NOT NULL DEFAULT 'dine-in',
  ADD COLUMN "table" INTEGER, ADD COLUMN guests INTEGER NOT NULL DEFAULT 1;
UPDATE "Order" SET date = created_at AT TIME ZONE 'UTC';
ALTER TABLE "Order" ALTER COLUMN date SET NOT NULL, ALTER COLUMN date SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order" ADD CONSTRAINT order_type_valid CHECK (type IN ('dine-in', 'takeaway')),
  ADD CONSTRAINT order_guests_positive CHECK (guests > 0),
  ADD CONSTRAINT order_table_positive CHECK ("table" IS NULL OR "table" > 0);
