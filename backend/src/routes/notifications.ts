import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
const LIMIT = 50;

// Latest お知らせ for the signed-in account, newest first.
router.get("/", requireAuth, async (req, res) => {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: {
        actor: { select: { name: true } },
        reel: { select: { id: true, caption: true, locationName: true } },
        comment: { select: { body: true } },
      },
    }),
    prisma.notification.count({ where: { recipientId: req.auth!.userId, readAt: null } }),
  ]);
  res.json({
    unreadCount,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      // The actor's account may have been deleted since (actorId → null).
      actorName: n.actor?.name ?? null,
      reel: n.reel,
      commentBody: n.comment?.body ?? null,
      read: n.readAt != null,
      createdAt: n.createdAt,
    })),
  });
});

// For the menu badge; cheap enough to poll.
router.get("/unread-count", requireAuth, async (req, res) => {
  res.json({ count: await prisma.notification.count({ where: { recipientId: req.auth!.userId, readAt: null } }) });
});

router.post("/read-all", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { recipientId: req.auth!.userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

export default router;
