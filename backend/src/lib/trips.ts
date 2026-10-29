import { prisma } from "../prisma";

// Trips a user can see and edit: their own, and ones they joined.
export function tripsOf(userId: string) {
  return { OR: [{ userId }, { members: { some: { userId } } }] };
}

// The trip if this user owns it or is a member (else null → 404), and which.
export async function accessibleTrip(userId: string, tripId: string) {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, ...tripsOf(userId) } });
  return trip ? { trip, isOwner: trip.userId === userId } : null;
}

// Everyone planning this trip: the owner and the members.
export async function tripParticipants(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { userId: true, members: { select: { userId: true } } } });
  return trip ? [trip.userId, ...trip.members.map((m) => m.userId)] : [];
}

// SavedReel is the "bookmarked at all" record: it exists exactly while the
// post is in at least one trip the user owns or joined. Call after trip items
// change, for everyone on the trip (see syncSavedForTrip).
export async function syncSaved(userId: string, reelIds: string[]) {
  const unique = [...new Set(reelIds)];
  if (unique.length === 0) return;
  const stillIn = new Set(
    (
      await prisma.tripItem.findMany({
        where: { reelId: { in: unique }, trip: tripsOf(userId) },
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

export async function syncSavedForUsers(userIds: string[], reelIds: string[]) {
  for (const userId of new Set(userIds)) await syncSaved(userId, reelIds);
}

export async function syncSavedForTrip(tripId: string, reelIds: string[]) {
  await syncSavedForUsers(await tripParticipants(tripId), reelIds);
}

// Adds a post at the end of a trip (no-op if it's already there).
export async function addToTrip(_userId: string, tripId: string, reelId: string) {
  const last = await prisma.tripItem.findFirst({ where: { tripId }, orderBy: { position: "desc" }, select: { position: true } });
  await prisma.tripItem.upsert({
    where: { tripId_reelId: { tripId, reelId } },
    create: { tripId, reelId, position: (last?.position ?? -1) + 1 },
    update: {},
  });
  await prisma.trip.update({ where: { id: tripId }, data: { updatedAt: new Date() } });
  await syncSavedForTrip(tripId, [reelId]);
}

export const DEFAULT_TRIP_NAME = "はじめての旅";

// Where a quick bookmark goes when no trip was chosen: the trip touched most
// recently, or a new "はじめての旅" for someone without any yet.
export async function defaultTripFor(userId: string) {
  const recent = await prisma.trip.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return recent ?? prisma.trip.create({ data: { userId, name: DEFAULT_TRIP_NAME } });
}
