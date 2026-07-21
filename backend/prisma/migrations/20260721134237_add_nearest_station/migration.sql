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
    "tourismInfo" TEXT NOT NULL DEFAULT '',
    "otaLinks" TEXT NOT NULL DEFAULT '[]',
    "nearestStationName" TEXT NOT NULL DEFAULT '',
    "nearestStationLat" REAL,
    "nearestStationLng" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Municipality_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Municipality" ("accessInfo", "avatarUrl", "createdAt", "description", "id", "lodgingInfo", "name", "otaLinks", "prefecture", "restaurantInfo", "tourismInfo", "userId") SELECT "accessInfo", "avatarUrl", "createdAt", "description", "id", "lodgingInfo", "name", "otaLinks", "prefecture", "restaurantInfo", "tourismInfo", "userId" FROM "Municipality";
DROP TABLE "Municipality";
ALTER TABLE "new_Municipality" RENAME TO "Municipality";
CREATE UNIQUE INDEX "Municipality_userId_key" ON "Municipality"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
