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
