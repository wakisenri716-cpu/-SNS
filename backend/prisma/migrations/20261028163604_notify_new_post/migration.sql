-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "nationality" TEXT,
    "birthYear" INTEGER,
    "notifyOnLike" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnComment" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnNewPost" BOOLEAN NOT NULL DEFAULT true,
    "travelCompanion" TEXT,
    "needsBarrierFree" BOOLEAN NOT NULL DEFAULT false,
    "needsMultilingual" BOOLEAN NOT NULL DEFAULT false,
    "favoriteCategories" TEXT NOT NULL DEFAULT '',
    "itineraryOrigin" TEXT NOT NULL DEFAULT '',
    "itineraryStartTime" TEXT NOT NULL DEFAULT '09:00',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("avatarUrl", "birthYear", "createdAt", "email", "favoriteCategories", "id", "itineraryOrigin", "itineraryStartTime", "name", "nationality", "needsBarrierFree", "needsMultilingual", "notifyOnComment", "notifyOnLike", "passwordHash", "role", "travelCompanion") SELECT "avatarUrl", "birthYear", "createdAt", "email", "favoriteCategories", "id", "itineraryOrigin", "itineraryStartTime", "name", "nationality", "needsBarrierFree", "needsMultilingual", "notifyOnComment", "notifyOnLike", "passwordHash", "role", "travelCompanion" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

