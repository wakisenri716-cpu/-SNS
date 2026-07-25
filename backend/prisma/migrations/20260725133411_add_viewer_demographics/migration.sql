-- AlterTable
ALTER TABLE "User" ADD COLUMN "birthYear" INTEGER;
ALTER TABLE "User" ADD COLUMN "nationality" TEXT;

-- CreateTable
CREATE TABLE "ReelView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "viewerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReelView_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReelView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReelView_reelId_idx" ON "ReelView"("reelId");

-- CreateIndex
CREATE INDEX "ReelView_viewerId_idx" ON "ReelView"("viewerId");
