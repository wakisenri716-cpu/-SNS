-- CreateTable
CREATE TABLE "TripReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'lodging',
    "name" TEXT NOT NULL,
    "reelId" TEXT,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME,
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "confirmation" TEXT NOT NULL DEFAULT '',
    "guests" INTEGER,
    "planName" TEXT NOT NULL DEFAULT '',
    "priceYen" INTEGER,
    "payment" TEXT NOT NULL DEFAULT '',
    "bookedVia" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripReservation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TripReservation_tripId_startAt_idx" ON "TripReservation"("tripId", "startAt");

