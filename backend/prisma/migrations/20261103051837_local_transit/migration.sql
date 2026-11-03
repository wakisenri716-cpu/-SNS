-- CreateTable
CREATE TABLE "LocalTransit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "municipalityId" TEXT NOT NULL,
    "companyId" TEXT,
    "reelId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "fileUrl" TEXT NOT NULL DEFAULT '',
    "fileKind" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "validUntil" TEXT,
    "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LocalTransit_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LocalTransit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LocalTransit_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LocalTransit_municipalityId_idx" ON "LocalTransit"("municipalityId");

-- CreateIndex
CREATE INDEX "LocalTransit_reelId_idx" ON "LocalTransit"("reelId");

