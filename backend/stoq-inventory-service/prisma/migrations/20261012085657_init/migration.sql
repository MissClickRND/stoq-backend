-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "inventory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "supply";

-- CreateEnum
CREATE TYPE "supply"."SupplyStatus" AS ENUM ('RECEIVED', 'CANCELLED', 'IN_TRANSIT');

-- CreateEnum
CREATE TYPE "inventory"."BatchStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED', 'QUARANTINED');

-- CreateTable
CREATE TABLE "supply"."supplies" (
    "id" SERIAL NOT NULL,
    "supply_number" TEXT NOT NULL,
    "status" "supply"."SupplyStatus" NOT NULL DEFAULT 'RECEIVED',
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply"."supply_items" (
    "id" SERIAL NOT NULL,
    "supply_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "shelf_life_days" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."batches" (
    "id" SERIAL NOT NULL,
    "supply_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "initial_quantity" DECIMAL NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "status" "inventory"."BatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."batch_balances" (
    "batch_id" INTEGER NOT NULL,
    "available_quantity" DECIMAL NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_balances_pkey" PRIMARY KEY ("batch_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplies_supply_number_key" ON "supply"."supplies"("supply_number");

-- CreateIndex
CREATE INDEX "supply_items_supply_id_idx" ON "supply"."supply_items"("supply_id");

-- CreateIndex
CREATE INDEX "batches_supply_id_idx" ON "inventory"."batches"("supply_id");

-- CreateIndex
CREATE INDEX "batches_product_id_idx" ON "inventory"."batches"("product_id");

-- AddForeignKey
ALTER TABLE "supply"."supply_items" ADD CONSTRAINT "supply_items_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supply"."supplies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."batch_balances" ADD CONSTRAINT "batch_balances_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
