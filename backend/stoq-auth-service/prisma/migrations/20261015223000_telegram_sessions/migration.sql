CREATE TABLE "TelegramSession" (
  "telegramUserId" VARCHAR(20) NOT NULL,
  "tokenDigest" CHAR(64) NOT NULL,
  "userId" INTEGER NOT NULL,
  "restaurantId" INTEGER NOT NULL,
  "tokenVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("telegramUserId"),
  CONSTRAINT "TelegramSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TelegramSession_identity_check" CHECK ("telegramUserId" ~ '^[1-9][0-9]{0,19}$')
);
CREATE UNIQUE INDEX "TelegramSession_tokenDigest_key" ON "TelegramSession"("tokenDigest");
CREATE INDEX "TelegramSession_userId_idx" ON "TelegramSession"("userId");
CREATE INDEX "TelegramSession_expiresAt_idx" ON "TelegramSession"("expiresAt");
