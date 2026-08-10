import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma";
import { JWT_SECRET, requireAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { guessNationalityFromIp } from "../services/geoLookup";
import { NATIONALITIES, type Role } from "../types";
import { municipalityDetailInclude, serializeMunicipality } from "./municipalities";

const router = Router();

function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  nationality: string | null;
  birthYear: number | null;
  notifyOnLike: boolean;
  notifyOnComment: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    nationality: user.nationality,
    birthYear: user.birthYear,
    notifyOnLike: user.notifyOnLike,
    notifyOnComment: user.notifyOnComment,
  };
}

// Nationality/birth year are optional and self-reported — collected only to power
// aggregated audience insights for municipality/company accounts (see
// GET /reels/mine/demographics). A visitor can skip both at signup and fill them
// in later from Settings, or never.
const currentYear = new Date().getFullYear();
const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  nationality: z.enum(NATIONALITIES).optional(),
  birthYear: z.coerce.number().int().min(1900).max(currentYear - 5).optional(),
});

const registerMunicipalitySchema = registerUserSchema.extend({
  municipalityName: z.string().min(1),
  prefecture: z.string().min(1),
});

const registerCompanySchema = registerUserSchema.extend({
  companyName: z.string().min(1),
  municipalityId: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function issueToken(userId: string, role: Role) {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });
}

const companySelect = {
  id: true,
  name: true,
  municipalityId: true,
  avatarUrl: true,
  commentsEnabled: true,
  municipality: { select: { id: true, name: true, prefecture: true } },
} as const;

// Best-effort nationality guess from the caller's IP address (see
// geoLookup.ts), used by the signup form to pre-fill (and let the visitor
// confirm/correct) the nationality field before they submit. No auth, no
// personal data stored by calling this — it's a stateless lookup.
router.get("/suggest-nationality", (req, res) => {
  res.json({ nationality: guessNationalityFromIp(req.ip) });
});

router.post("/register", async (req, res) => {
  const parsed = registerUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, name, birthYear } = parsed.data;
  // Fall back to an IP-based guess if the client didn't send one (e.g. the
  // signup form's own lookup failed, or a direct API call skipped it) — still
  // just a hint, never shown as fact, and editable anytime from Settings.
  const nationality = parsed.data.nationality ?? guessNationalityFromIp(req.ip) ?? undefined;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "このメールアドレスは既に登録されています" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: "USER", nationality, birthYear },
  });

  const token = issueToken(user.id, "USER");
  res.status(201).json({
    token,
    user: serializeUser(user),
  });
});

router.post("/register-municipality", async (req, res) => {
  const parsed = registerMunicipalitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, name, municipalityName, prefecture } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "このメールアドレスは既に登録されています" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: "MUNICIPALITY",
      municipality: {
        create: {
          name: municipalityName,
          prefecture,
        },
      },
    },
    include: { municipality: { include: municipalityDetailInclude } },
  });

  const token = issueToken(user.id, "MUNICIPALITY");
  res.status(201).json({
    token,
    user: serializeUser(user),
    municipality: serializeMunicipality(user.municipality!),
  });
});

// Companies self-register and pick an existing, already-registered municipality to
// post under. There's no approval step from the municipality — see the README for
// the tradeoff this implies (anyone can claim affiliation with a real municipality).
router.post("/register-company", async (req, res) => {
  const parsed = registerCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, name, companyName, municipalityId } = parsed.data;

  const municipality = await prisma.municipality.findUnique({ where: { id: municipalityId } });
  if (!municipality) {
    return res.status(400).json({ error: "選択された自治体が見つかりません" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "このメールアドレスは既に登録されています" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: "COMPANY",
      company: {
        create: {
          name: companyName,
          municipalityId,
        },
      },
    },
    include: { company: { select: companySelect } },
  });

  const token = issueToken(user.id, "COMPANY");
  res.status(201).json({
    token,
    user: serializeUser(user),
    company: user.company,
  });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { municipality: { include: municipalityDetailInclude }, company: { select: companySelect } },
  });
  if (!user) {
    return res.status(401).json({ error: "メールアドレスまたはパスワードが違います" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "メールアドレスまたはパスワードが違います" });
  }

  const token = issueToken(user.id, user.role as Role);
  res.json({
    token,
    user: serializeUser(user),
    municipality: user.municipality ? serializeMunicipality(user.municipality) : null,
    company: user.company ?? null,
  });
});

// Session check: confirms the token's user still exists. Needed because the demo
// deployment uses ephemeral storage — the database can reset independently of a
// browser's saved login, leaving a token that "looks" valid (correct signature)
// but points at a user row that's gone. Callers use this to detect that case and
// force a fresh login instead of failing confusingly deeper in the app.
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { municipality: { include: municipalityDetailInclude }, company: { select: companySelect } },
  });
  if (!user) {
    return res.status(401).json({ error: "セッションが無効です。再度ログインしてください" });
  }
  res.json({
    user: serializeUser(user),
    municipality: user.municipality ? serializeMunicipality(user.municipality) : null,
    company: user.company ?? null,
  });
});

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  nationality: z.enum(NATIONALITIES).optional(),
  birthYear: z.coerce.number().int().min(1900).max(currentYear - 5).optional(),
  notifyOnLike: z.boolean().optional(),
  notifyOnComment: z.boolean().optional(),
});

// Account settings: update the signed-in user's own name/email/notification
// preferences (any role).
router.put("/me", requireAuth, async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.email) {
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing && existing.id !== req.auth!.userId) {
      return res.status(409).json({ error: "このメールアドレスは既に使用されています" });
    }
  }

  const updated = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: parsed.data,
  });
  res.json(serializeUser(updated));
});

// Profile picture — shared by all account types (general users, and municipality/
// company accounts that don't yet have a separate branded avatar set elsewhere).
router.post("/me/avatar", requireAuth, upload.single("avatar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "ファイルがありません" });

  const updated = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { avatarUrl: `/uploads/${req.file.filename}` },
  });
  res.json(serializeUser(updated));
});

// Delete the signed-in user's own account. Cascades (see schema.prisma) remove
// the linked Municipality/Company profile, their reels, likes, and comments.
// This is irreversible and requires the current password as confirmation.
const deleteMeSchema = z.object({ password: z.string().min(1) });

router.delete("/me", requireAuth, async (req, res) => {
  const parsed = deleteMeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return res.status(404).json({ error: "ユーザーが見つかりません" });

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "パスワードが正しくありません" });

  await prisma.user.delete({ where: { id: user.id } });
  res.status(204).end();
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.put("/password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return res.status(404).json({ error: "ユーザーが見つかりません" });

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "現在のパスワードが正しくありません" });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.status(204).end();
});

export default router;
