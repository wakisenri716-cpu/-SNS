-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Company_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Company" ("createdAt", "id", "municipalityId", "name", "userId") SELECT "createdAt", "id", "municipalityId", "name", "userId" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_userId_key" ON "Company"("userId");
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
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Municipality_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Municipality" ("accessInfo", "avatarUrl", "createdAt", "description", "id", "lodgingInfo", "name", "nearestStationLat", "nearestStationLng", "nearestStationName", "otaLinks", "prefecture", "restaurantInfo", "tourismInfo", "userId") SELECT "accessInfo", "avatarUrl", "createdAt", "description", "id", "lodgingInfo", "name", "nearestStationLat", "nearestStationLng", "nearestStationName", "otaLinks", "prefecture", "restaurantInfo", "tourismInfo", "userId" FROM "Municipality";
DROP TABLE "Municipality";
ALTER TABLE "new_Municipality" RENAME TO "Municipality";
CREATE UNIQUE INDEX "Municipality_userId_key" ON "Municipality"("userId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "notifyOnLike" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnComment" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "role") SELECT "createdAt", "email", "id", "name", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
