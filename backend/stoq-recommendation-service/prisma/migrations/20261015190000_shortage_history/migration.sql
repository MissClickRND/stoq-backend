CREATE TABLE "ShortageTracking" (
  "restaurantId" INTEGER PRIMARY KEY,
  "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "DishAvailability" (
  "restaurantId" INTEGER NOT NULL,
  "dishId" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "episode" INTEGER NOT NULL DEFAULT 0,
  "observedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("restaurantId", "dishId")
);
CREATE TABLE "ShortageIncident" (
  "restaurantId" INTEGER NOT NULL,
  "dishId" INTEGER NOT NULL,
  "episode" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "productName" TEXT NOT NULL,
  "unit" JSONB,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("restaurantId", "dishId", "episode", "productId")
);
CREATE INDEX "ShortageIncident_restaurantId_occurredAt_idx" ON "ShortageIncident"("restaurantId", "occurredAt");
