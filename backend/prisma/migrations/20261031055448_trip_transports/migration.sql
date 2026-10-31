-- CreateTable
CREATE TABLE "TripTransport" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripTransport_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TripTransport_tripId_departAt_idx" ON "TripTransport"("tripId", "departAt");

