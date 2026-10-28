import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { getVapidKeys, rememberSiteOrigin } from "../lib/push";

const router = Router();

// The key browsers need to subscribe (applicationServerKey).
router.get("/public-key", async (_req, res) => {
  res.json({ key: (await getVapidKeys()).publicKey });
});

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  lang: z.enum(["ja", "en", "zh", "ko"]).default("ja"),
});

// This device wants pushes for the signed-in account. An endpoint is one
// browser on one device: subscribing again (another account signed in on it,
// or a new UI language) moves it rather than duplicating it.
router.post("/subscribe", requireAuth, async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "購読情報が正しくありません" });
  const { endpoint, keys, lang } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: req.auth!.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, lang },
    update: { userId: req.auth!.userId, p256dh: keys.p256dh, auth: keys.auth, lang },
  });
  await rememberSiteOrigin(`${req.protocol}://${req.get("host")}`);
  res.status(204).end();
});

router.delete("/subscribe", requireAuth, async (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.auth!.userId } });
  res.status(204).end();
});

export default router;
