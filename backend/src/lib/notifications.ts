import { prisma } from "../prisma";

// Creates an お知らせ for the account that posted a reel (the company for a
// company post, otherwise the municipality) — unless the actor is that
// account, or the recipient turned that kind of notification off in Settings.
// Failures are logged, never thrown: a notification must not break the like
// or comment that triggered it.
export async function notifyPoster(input: {
  reelId: string;
  actorId: string;
  type: "like" | "comment";
  commentId?: string;
}) {
  try {
    const reel = await prisma.reel.findUnique({
      where: { id: input.reelId },
      select: {
        municipality: { select: { user: { select: { id: true, notifyOnLike: true, notifyOnComment: true } } } },
        company: { select: { user: { select: { id: true, notifyOnLike: true, notifyOnComment: true } } } },
      },
    });
    if (!reel) return;
    const recipient = reel.company?.user ?? reel.municipality.user;
    if (recipient.id === input.actorId) return;
    if (input.type === "like" && !recipient.notifyOnLike) return;
    if (input.type === "comment" && !recipient.notifyOnComment) return;

    // Liking, unliking and liking again shouldn't notify twice.
    if (input.type === "like") {
      const existing = await prisma.notification.findFirst({
        where: { recipientId: recipient.id, type: "like", reelId: input.reelId, actorId: input.actorId },
        select: { id: true },
      });
      if (existing) return;
    }

    await prisma.notification.create({
      data: {
        recipientId: recipient.id,
        type: input.type,
        reelId: input.reelId,
        actorId: input.actorId,
        commentId: input.commentId,
      },
    });
  } catch (err) {
    console.error("[notifications] Failed to create notification:", err);
  }
}

// New post → お知らせ for everyone following the posting municipality or
// company (once each, even if they follow both), except the poster's own
// account and followers who turned these off. Logged, never thrown.
export async function notifyFollowersOfNewPost(input: {
  reelId: string;
  actorId: string;
  municipalityId: string;
  companyId: string | null;
}) {
  try {
    const follows = await prisma.follow.findMany({
      where: {
        OR: [{ municipalityId: input.municipalityId }, ...(input.companyId ? [{ companyId: input.companyId }] : [])],
        follower: { notifyOnNewPost: true },
      },
      select: { followerId: true },
    });
    const recipients = [...new Set(follows.map((f) => f.followerId))].filter((id) => id !== input.actorId);
    if (recipients.length === 0) return;
    await prisma.notification.createMany({
      data: recipients.map((recipientId) => ({
        recipientId,
        type: "newPost",
        reelId: input.reelId,
        actorId: input.actorId,
      })),
    });
  } catch (err) {
    console.error("[notifications] Failed to notify followers:", err);
  }
}
