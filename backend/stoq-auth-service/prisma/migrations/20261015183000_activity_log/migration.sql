CREATE TABLE "ActivityLog" (
  "id" TEXT PRIMARY KEY,
  "restaurantId" INTEGER NOT NULL,
  "authorId" INTEGER,
  "authorName" TEXT NOT NULL,
  "authorRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "object" TEXT,
  "detail" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ActivityLog_restaurantId_createdAt_id_idx" ON "ActivityLog"("restaurantId", "createdAt", "id");
