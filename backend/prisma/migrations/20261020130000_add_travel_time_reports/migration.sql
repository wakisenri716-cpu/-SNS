-- CreateTable
CREATE TABLE "TravelTimeReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "originLabel" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TravelTimeReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TravelTimeReport_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TravelTimeReport_reelId_idx" ON "TravelTimeReport"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelTimeReport_userId_reelId_mode_key" ON "TravelTimeReport"("userId", "reelId", "mode");

