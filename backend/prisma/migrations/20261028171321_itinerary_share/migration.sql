-- AlterTable
ALTER TABLE "User" ADD COLUMN "itineraryShareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_itineraryShareToken_key" ON "User"("itineraryShareToken");

