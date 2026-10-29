-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Municipality" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "accessInfo" TEXT NOT NULL DEFAULT '',
    "lodgingInfo" TEXT NOT NULL DEFAULT '',
    "restaurantInfo" TEXT NOT NULL DEFAULT '',
    "otaLinks" TEXT NOT NULL DEFAULT '[]',
    "nearestStationName" TEXT NOT NULL DEFAULT '',
    "nearestStationLat" REAL,
    "nearestStationLng" REAL,
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "kana" TEXT NOT NULL DEFAULT '',
    "websiteUrl" TEXT NOT NULL DEFAULT '',
    "lgCode" TEXT,
    "officeLat" REAL,
    "officeLng" REAL,
    "listing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Municipality_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Municipality" ("accessInfo", "avatarUrl", "commentsEnabled", "createdAt", "description", "id", "lodgingInfo", "name", "nearestStationLat", "nearestStationLng", "nearestStationName", "otaLinks", "prefecture", "restaurantInfo", "userId") SELECT "accessInfo", "avatarUrl", "commentsEnabled", "createdAt", "description", "id", "lodgingInfo", "name", "nearestStationLat", "nearestStationLng", "nearestStationName", "otaLinks", "prefecture", "restaurantInfo", "userId" FROM "Municipality";
DROP TABLE "Municipality";
ALTER TABLE "new_Municipality" RENAME TO "Municipality";
CREATE UNIQUE INDEX "Municipality_userId_key" ON "Municipality"("userId");
CREATE UNIQUE INDEX "Municipality_lgCode_key" ON "Municipality"("lgCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

