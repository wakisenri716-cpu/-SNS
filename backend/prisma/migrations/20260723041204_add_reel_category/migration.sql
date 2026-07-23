-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Reel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "municipalityId" TEXT NOT NULL,
    "companyId" TEXT,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "locationName" TEXT,
    "locationLat" REAL,
    "locationLng" REAL,
    "category" TEXT NOT NULL DEFAULT 'nature',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reel_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Reel" ("caption", "companyId", "createdAt", "id", "locationLat", "locationLng", "locationName", "municipalityId", "thumbnailUrl", "videoUrl", "viewCount") SELECT "caption", "companyId", "createdAt", "id", "locationLat", "locationLng", "locationName", "municipalityId", "thumbnailUrl", "videoUrl", "viewCount" FROM "Reel";
DROP TABLE "Reel";
ALTER TABLE "new_Reel" RENAME TO "Reel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
