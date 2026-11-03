-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "paidUnits" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT '',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Earlier rows were one use each; "paid" meant it used an AIチケット.
INSERT INTO "new_AiUsage" ("createdAt", "feature", "id", "userId", "units", "paidUnits") SELECT "createdAt", "feature", "id", "userId", 1, CASE WHEN "paid" THEN 1 ELSE 0 END FROM "AiUsage";
DROP TABLE "AiUsage";
ALTER TABLE "new_AiUsage" RENAME TO "AiUsage";
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

