-- Reconstruct fields used by the application before the category migration.
-- IF NOT EXISTS also supports databases previously updated with db push.
ALTER TABLE "Dish" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Dish" ADD COLUMN IF NOT EXISTS "imageURL" TEXT;
ALTER TABLE "Dish" ADD COLUMN IF NOT EXISTS "salePrice" DECIMAL(18,2);
