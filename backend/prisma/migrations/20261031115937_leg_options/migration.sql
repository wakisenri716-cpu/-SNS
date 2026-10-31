-- CreateTable
CREATE TABLE "TripLegOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "durationMin" INTEGER,
    "fareYen" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "chosen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripLegOption_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TripTransport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operator" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL,
    "toName" TEXT NOT NULL,
    "departAt" DATETIME NOT NULL,
    "arriveAt" DATETIME NOT NULL,
    "departPlatform" TEXT NOT NULL DEFAULT '',
    "arrivePlatform" TEXT NOT NULL DEFAULT '',
    "seat" TEXT NOT NULL DEFAULT '',
    "confirmation" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "departNotifiedAt" DATETIME,
    "arriveNotifiedAt" DATETIME,
    "optionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripTransport_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripTransport_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "TripLegOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TripTransport" ("arriveAt", "arriveNotifiedAt", "arrivePlatform", "confirmation", "createdAt", "departAt", "departNotifiedAt", "departPlatform", "fromName", "id", "kind", "name", "note", "operator", "seat", "toName", "tripId") SELECT "arriveAt", "arriveNotifiedAt", "arrivePlatform", "confirmation", "createdAt", "departAt", "departNotifiedAt", "departPlatform", "fromName", "id", "kind", "name", "note", "operator", "seat", "toName", "tripId" FROM "TripTransport";
DROP TABLE "TripTransport";
ALTER TABLE "new_TripTransport" RENAME TO "TripTransport";
CREATE INDEX "TripTransport_tripId_departAt_idx" ON "TripTransport"("tripId", "departAt");
CREATE INDEX "TripTransport_optionId_idx" ON "TripTransport"("optionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TripLegOption_tripId_idx" ON "TripLegOption"("tripId");

