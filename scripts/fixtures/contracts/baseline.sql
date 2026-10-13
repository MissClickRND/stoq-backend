-- Schema before the new fields. This fixture is applied only to a fresh test database.
CREATE SCHEMA inventory;
CREATE SCHEMA supply;
CREATE TYPE supply."SupplyStatus" AS ENUM ('RECEIVED','CANCELLED','IN_TRANSIT');
CREATE TYPE inventory."BatchStatus" AS ENUM ('ACTIVE','DEPLETED','EXPIRED','QUARANTINED');
CREATE TABLE supply.supplies (
  id SERIAL PRIMARY KEY, supply_number TEXT UNIQUE NOT NULL,
  status supply."SupplyStatus" NOT NULL DEFAULT 'RECEIVED',
  received_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(), created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE TABLE supply.supply_items (
  id SERIAL PRIMARY KEY, supply_id INTEGER NOT NULL REFERENCES supply.supplies(id), product_id INTEGER NOT NULL,
  quantity DECIMAL NOT NULL, expires_at TIMESTAMPTZ(6) NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE TABLE inventory.batches (
  id SERIAL PRIMARY KEY, supply_id INTEGER NOT NULL, product_id INTEGER NOT NULL, initial_quantity DECIMAL NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL, status inventory."BatchStatus" NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE TABLE inventory.batch_balances (
  batch_id INTEGER PRIMARY KEY REFERENCES inventory.batches(id), available_quantity DECIMAL NOT NULL DEFAULT 0,
  reserved_quantity DECIMAL NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE TABLE "Unit" (
  id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, "shortName" TEXT UNIQUE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Product" (
  id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, "unitId" INTEGER NOT NULL REFERENCES "Unit"(id),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "Dish" (
  id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, "imageURL" TEXT, "salePrice" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "RecipeItem" (
  id SERIAL PRIMARY KEY, "dishId" INTEGER NOT NULL REFERENCES "Dish"(id), "productId" INTEGER NOT NULL REFERENCES "Product"(id),
  quantity INTEGER NOT NULL, UNIQUE ("dishId", "productId")
);
CREATE TYPE "OrderStatus" AS ENUM ('created','pending_reservation','confirmed','rejected','cancelled','completed');
CREATE TABLE "Order" (
  id SERIAL PRIMARY KEY, status "OrderStatus" NOT NULL DEFAULT 'created',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL
);
CREATE TABLE "OrderItem" (
  id SERIAL PRIMARY KEY, "orderId" INTEGER NOT NULL REFERENCES "Order"(id), "dishId" INTEGER NOT NULL, quantity INTEGER NOT NULL
);
