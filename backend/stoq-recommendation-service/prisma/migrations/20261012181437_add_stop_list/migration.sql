-- CreateEnum
CREATE TYPE "StopListReason" AS ENUM ('INSUFFICIENT_STOCK', 'EXPIRED_INGREDIENT');

-- CreateTable
CREATE TABLE "StopListItem" (
    "id" SERIAL NOT NULL,
    "dishId" INTEGER NOT NULL,
    "reason" "StopListReason" NOT NULL,
    "productId" INTEGER NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "expectedReturnAt" TIMESTAMP(3),

    CONSTRAINT "StopListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StopListItem_dishId_idx" ON "StopListItem"("dishId");

-- CreateIndex
CREATE INDEX "StopListItem_productId_idx" ON "StopListItem"("productId");

-- CreateIndex
CREATE INDEX "StopListItem_detectedAt_idx" ON "StopListItem"("detectedAt");
