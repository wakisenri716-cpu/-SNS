import fs from "fs";
import path from "path";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { translateLimiter, writeLimiter } from "../middleware/rateLimit";
import { UPLOAD_DIR, readTransitFileUpload, uploadTransitFile } from "../middleware/upload";
import { resolvePosterContext } from "../lib/posterContext";
import { checkAiQuota, recordAiUse } from "../lib/aiQuota";
import { ttlCache } from "../lib/ttlCache";
import { isClaudeConfigured, logClaudeError } from "../services/claude";
import { readTransitFile, type TransitFile } from "../services/transitReader";
import { translateCaption } from "../services/translate";
import { todayInJapan } from "./events";

// 地元の交通情報 (see the LocalTransit model): municipalities and businesses
// add the transport information that's often only on their own website, from
// a screenshot or PDF; travelers see it on the access pages.
const router = Router();

const include = {
  municipality: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  reel: { select: { id: true, locationName: true } },
} as const;
type Row = Awaited<ReturnType<typeof prisma.localTransit.findFirstOrThrow<{ include: typeof include }>>>;

const serialize = (r: Row) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  fileUrl: r.fileUrl || null,
  fileKind: r.fileKind || null,
  fileName: r.fileName,
  sourceUrl: r.sourceUrl || null,
  validUntil: r.validUntil,
  aiDrafted: r.aiDrafted,
  updatedAt: r.updatedAt,
  issuer: r.company ? { kind: "company", id: r.company.id, name: r.company.name } : { kind: "municipality", id: r.municipality.id, name: r.municipality.name },
  reel: r.reel ? { id: r.reel.id, locationName: r.reel.locationName } : null,
});

const current = () => ({ OR: [{ validUntil: null }, { validUntil: { gte: todayInJapan() } }] });
const MAX_PER_ISSUER = 30;

// ---- Travelers ----------------------------------------------------------------

// For one spot (its own, then the municipality's general ones), or a whole municipality.
router.get("/", async (req, res) => {
  const reelId = typeof req.query.reelId === "string" ? req.query.reelId : undefined;
  const municipalityId = typeof req.query.municipalityId === "string" ? req.query.municipalityId : undefined;
  let where;
  if (reelId) {
    const reel = await prisma.reel.findUnique({ where: { id: reelId }, select: { municipalityId: true } });
    if (!reel) return res.json({ items: [] });
    where = { municipalityId: reel.municipalityId, AND: [current(), { OR: [{ reelId }, { reelId: null }] }] };
  } else if (municipalityId) {
    where = { municipalityId, ...current() };
  } else {
    return res.status(400).json({ error: "場所を指定してください" });
  }
  const rows = await prisma.localTransit.findMany({ where, include, orderBy: { updatedAt: "desc" }, take: 50 });
  // A spot's own information first.
  rows.sort((a, b) => Number(!!b.reelId && b.reelId === reelId) - Number(!!a.reelId && a.reelId === reelId));
  res.json({ items: rows.map(serialize) });
});

// 翻訳を見る: into the traveler's language (cached per version for a day).
const translations = ttlCache<{ title: string; body: string }>(24 * 60 * 60 * 1000, 500);
router.post("/:id/translation", translateLimiter, async (req, res) => {
  const parsed = z.object({ lang: z.enum(["ja", "en", "zh", "ko"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "翻訳先の言語が正しくありません" });
  const row = await prisma.localTransit.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: "見つかりません" });
  if (!isClaudeConfigured()) return res.status(503).json({ error: "翻訳機能は現在利用できません" });
  try {
    const out = await translations.get(`${row.id}:${row.updatedAt.getTime()}:${parsed.data.lang}`, async () => {
      const [title, body] = await Promise.all([
        translateCaption(row.title, parsed.data.lang),
        row.body ? translateCaption(row.body, parsed.data.lang) : Promise.resolve(""),
      ]);
      return { title, body };
    });
    res.json(out);
  } catch (err) {
    logClaudeError("localTransit.translate", err);
    res.status(502).json({ error: "翻訳できませんでした" });
  }
});

// ---- Municipalities and businesses ----------------------------------------------

const issuerWhere = (p: { municipalityId: string; companyId: string | null }) =>
  p.companyId ? { companyId: p.companyId } : { municipalityId: p.municipalityId, companyId: null };

router.get("/mine", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  const rows = await prisma.localTransit.findMany({ where: issuerWhere(poster), include, orderBy: { updatedAt: "desc" } });
  res.json({ items: rows.map(serialize) });
});

// AIで読み取る: a draft of the key points from the file (not saved).
router.post("/read", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), writeLimiter, readTransitFileUpload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "画像かPDFを選んでください" });
  // Claude takes images up to 5MB.
  if (req.file.mimetype !== "application/pdf" && req.file.size > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "AIで読み取れる画像は5MBまでです。小さくするか、文字で入力してください" });
  }
  const quota = await checkAiQuota(req, res, "transitRead");
  if (quota === "refused") return;
  if (quota === "noAi") return res.status(503).json({ code: "aiUnavailable", error: "いまはAIで読み取れません。内容を文字で入力してください" });
  try {
    const { usage, ...draft } = await readTransitFile({ data: req.file.buffer, mime: req.file.mimetype as TransitFile["mime"] });
    await recordAiUse(req, "transitRead", usage);
    res.json(draft);
  } catch (err) {
    logClaudeError("localTransit.read", err);
    res.status(502).json({ error: "AIで読み取れませんでした。内容を文字で入力してください" });
  }
});

const fieldsSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(3000).default(""),
  reelId: z.string().trim().max(40).nullable().default(null).transform((v) => v || null),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .default("")
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "URL"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  aiDrafted: z.coerce.boolean().default(false),
});
// Multipart forms send everything as text.
const fromForm = (b: Record<string, unknown>) => ({
  ...b,
  reelId: b.reelId || null,
  validUntil: b.validUntil || null,
  aiDrafted: b.aiDrafted === "true" || b.aiDrafted === true,
});

/** The spot must be one this account can speak for: a municipality's own town, a business's own posts. */
async function spotAllowed(reelId: string | null, poster: { municipalityId: string; companyId: string | null }) {
  if (!reelId) return true;
  const reel = await prisma.reel.findUnique({ where: { id: reelId }, select: { municipalityId: true, companyId: true } });
  if (!reel) return false;
  return poster.companyId ? reel.companyId === poster.companyId : reel.municipalityId === poster.municipalityId;
}

const removeFile = (url: string) => url && fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});

router.post("/", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), writeLimiter, uploadTransitFile.single("file"), async (req, res) => {
  const file = req.file;
  const fail = (status: number, error: string) => {
    if (file) removeFile(`/uploads/${file.filename}`);
    return res.status(status).json({ error });
  };
  const parsed = fieldsSchema.safeParse(fromForm(req.body ?? {}));
  if (!parsed.success) return fail(400, "タイトルを入力し、URLは https:// から始めてください");
  if (!parsed.data.body && !file) return fail(400, "内容を入力するか、画像・PDFを付けてください");
  const poster = await resolvePosterContext(req, res);
  if (!poster) return file && removeFile(`/uploads/${file.filename}`);
  if (!(await spotAllowed(parsed.data.reelId, poster))) return fail(400, "この場所には追加できません");
  if ((await prisma.localTransit.count({ where: issuerWhere(poster) })) >= MAX_PER_ISSUER) return fail(400, `交通情報は${MAX_PER_ISSUER}件までです`);
  const created = await prisma.localTransit.create({
    data: {
      ...parsed.data,
      municipalityId: poster.municipalityId,
      companyId: poster.companyId,
      ...(file
        ? {
            fileUrl: `/uploads/${file.filename}`,
            fileKind: file.mimetype === "application/pdf" ? "pdf" : "image",
            fileName: Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 120),
          }
        : {}),
    },
    include,
  });
  res.status(201).json(serialize(created));
});

router.put("/:id", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), writeLimiter, async (req, res) => {
  const parsed = fieldsSchema.omit({ aiDrafted: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "タイトルを入力し、URLは https:// から始めてください" });
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  const row = await prisma.localTransit.findFirst({ where: { id: req.params.id, ...issuerWhere(poster) } });
  if (!row) return res.status(404).json({ error: "見つかりません" });
  if (!parsed.data.body && !row.fileUrl) return res.status(400).json({ error: "内容を入力してください" });
  if (!(await spotAllowed(parsed.data.reelId, poster))) return res.status(400).json({ error: "この場所には追加できません" });
  const updated = await prisma.localTransit.update({ where: { id: row.id }, data: parsed.data, include });
  res.json(serialize(updated));
});

router.delete("/:id", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  const row = await prisma.localTransit.findFirst({ where: { id: req.params.id, ...issuerWhere(poster) } });
  if (!row) return res.status(404).json({ error: "見つかりません" });
  await prisma.localTransit.delete({ where: { id: row.id } });
  removeFile(row.fileUrl);
  res.status(204).end();
});

export default router;
