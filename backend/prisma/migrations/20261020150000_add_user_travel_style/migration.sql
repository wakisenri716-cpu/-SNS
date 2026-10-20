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
    "travelCompanion" TEXT,
    "needsBarrierFree" BOOLEAN NOT NULL DEFAULT false,
    "needsMultilingual" BOOLEAN NOT NULL DEFAULT false,
    "favoriteCategories" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("avatarUrl", "birthYear", "createdAt", "email", "id", "name", "nationality", "notifyOnComment", "notifyOnLike", "passwordHash", "role") SELECT "avatarUrl", "birthYear", "createdAt", "email", "id", "name", "nationality", "notifyOnComment", "notifyOnLike", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

