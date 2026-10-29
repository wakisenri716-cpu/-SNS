-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT,
    "originLabel" TEXT NOT NULL DEFAULT '',
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "shareToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "stayMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripItem_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_shareToken_key" ON "Trip"("shareToken");

-- CreateIndex
CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripItem_tripId_reelId_key" ON "TripItem"("tripId", "reelId");


-- Move each traveler's existing しおり into a first trip, "はじめての旅",
-- keeping its order, stay times, start point/time and share link.
INSERT INTO "Trip" ("id", "userId", "name", "originLabel", "startTime", "shareToken", "createdAt", "updatedAt")
SELECT
    'trip' || lower(hex(randomblob(10))),
    u."id",
    'はじめての旅',
    u."itineraryOrigin",
    u."itineraryStartTime",
    u."itineraryShareToken",
    -- Prisma keeps SQLite DateTime as integer milliseconds.
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "SavedReel" s WHERE s."userId" = u."id")
   OR u."itineraryShareToken" IS NOT NULL;

INSERT INTO "TripItem" ("id", "tripId", "reelId", "position", "stayMinutes", "createdAt")
SELECT
    'item' || lower(hex(randomblob(10))),
    t."id",
    s."reelId",
    ROW_NUMBER() OVER (
        PARTITION BY s."userId"
        ORDER BY (s."position" IS NULL), s."position", s."createdAt"
    ) - 1,
    s."stayMinutes",
    s."createdAt"
FROM "SavedReel" s
JOIN "Trip" t ON t."userId" = s."userId";

-- The links now live on the trip.
UPDATE "User" SET "itineraryShareToken" = NULL WHERE "itineraryShareToken" IS NOT NULL;
