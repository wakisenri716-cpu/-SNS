import { prisma } from "../prisma";

// SavedReel is the "bookmarked at all" record: it exists exactly while the
// post is in at least one of the user's trips. Call after trip items change.
export async function syncSaved(userId: string, reelIds: string[]) {
  const unique = [...new Set(reelIds)];
  if (unique.length === 0) return;
  const stillIn = new Set(
    (
      await prisma.tripItem.findMany({
        where: { reelId: { in: unique }, trip: { userId } },
        select: { reelId: true },
      })
    ).map((i) => i.reelId)
  );
  await prisma.$transaction([
    prisma.savedReel.deleteMany({ where: { userId, reelId: { in: unique.filter((id) => !stillIn.has(id)) } } }),
    ...unique
      .filter((id) => stillIn.has(id))
      .map((reelId) =>
        prisma.savedReel.upsert({
          where: { userId_reelId: { userId, reelId } },
          create: { userId, reelId },
          update: {},
        })
      ),
  ]);
}

// Adds a post at the end of a trip (no-op if it's already there).
export async function addToTrip(userId: string, tripId: string, reelId: string) {
  const last = await prisma.tripItem.findFirst({ where: { tripId }, orderBy: { position: "desc" }, select: { position: true } });
  await prisma.tripItem.upsert({
    where: { tripId_reelId: { tripId, reelId } },
    create: { tripId, reelId, position: (last?.position ?? -1) + 1 },
    update: {},
  });
  await prisma.trip.update({ where: { id: tripId }, data: { updatedAt: new Date() } });
  await syncSaved(userId, [reelId]);
}

export const DEFAULT_TRIP_NAME = "はじめての旅";

// Where a quick bookmark goes when no trip was chosen: the trip touched most
// recently, or a new "はじめての旅" for someone without any yet.
export async function defaultTripFor(userId: string) {
  const recent = await prisma.trip.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return recent ?? prisma.trip.create({ data: { userId, name: DEFAULT_TRIP_NAME } });
}
