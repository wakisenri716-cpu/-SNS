import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import { resolvePosterContext } from "../lib/posterContext";

const router = Router();

// Today's date in Japan as YYYY-MM-DD — events are listed by local day.
export function todayInJapan(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

const eventInclude = {
  municipality: { select: { id: true, name: true, prefecture: true, avatarUrl: true } },
  company: { select: { id: true, name: true } },
} as const;

// Upcoming and ongoing events, soonest first. ?municipalityId= narrows to one
// municipality (its profile's イベント tab).
router.get("/", async (req, res) => {
  const municipalityId = typeof req.query.municipalityId === "string" ? req.query.municipalityId : undefined;
  const events = await prisma.event.findMany({
    where: { endDate: { gte: todayInJapan() }, ...(municipalityId ? { municipalityId } : {}) },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    take: 50,
    include: eventInclude,
  });
  res.json({ items: events });
});

// The signed-in poster's own events, including past ones (for the dashboard).
router.get("/mine", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  const events = await prisma.event.findMany({
    where: poster.companyId ? { companyId: poster.companyId } : { municipalityId: poster.municipalityId },
    orderBy: { startDate: "desc" },
    include: eventInclude,
  });
  res.json({ items: events });
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(1000).default(""),
    startDate: date,
    endDate: date,
    locationName: z.string().trim().max(80).default(""),
    url: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https?:\/\//.test(v), "URLはhttp(s)://から始めてください")
      .default(""),
  })
  .refine((e) => e.endDate >= e.startDate, { message: "終了日は開始日以降にしてください", path: ["endDate"] });

router.post("/", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), writeLimiter, async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" });
  const event = await prisma.event.create({
    data: { ...parsed.data, municipalityId: poster.municipalityId, companyId: poster.companyId },
    include: eventInclude,
  });
  res.status(201).json(event);
});

router.delete("/:id", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) return res.status(404).json({ error: "イベントが見つかりません" });
  // Same rule as posts: a company manages its own; the municipality manages
  // everything under it.
  const allowed = poster.companyId ? event.companyId === poster.companyId : event.municipalityId === poster.municipalityId;
  if (!allowed) return res.status(403).json({ error: "このイベントは削除できません" });
  await prisma.event.delete({ where: { id: event.id } });
  res.status(204).end();
});

export default router;
