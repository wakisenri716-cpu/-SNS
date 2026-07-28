import { prisma } from "../prisma";

export interface FollowedIds {
  followedMunicipalityIds: Set<string>;
  followedCompanyIds: Set<string>;
}

// One query to know everything the signed-in viewer follows, so serializeReel
// can mark each reel's poster as followed/not without a query per reel.
export async function getFollowedIds(userId: string | undefined): Promise<FollowedIds> {
  if (!userId) return { followedMunicipalityIds: new Set(), followedCompanyIds: new Set() };

  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { municipalityId: true, companyId: true },
  });

  return {
    followedMunicipalityIds: new Set(follows.flatMap((f) => (f.municipalityId ? [f.municipalityId] : []))),
    followedCompanyIds: new Set(follows.flatMap((f) => (f.companyId ? [f.companyId] : []))),
  };
}
