import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma";
import { JWT_SECRET, requireAuth } from "../middleware/auth";
import type { Role } from "../types";

const router = Router();

const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
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
  municipality: { select: { id: true, name: true, prefecture: true } },
} as const;

router.post("/register", async (req, res) => {
  const parsed = registerUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "このメールアドレスは既に登録されています" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: "USER" },
  });

  const token = issueToken(user.id, "USER");
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
    include: { municipality: true },
  });

  const token = issueToken(user.id, "MUNICIPALITY");
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    municipality: user.municipality,
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
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
    include: { municipality: true, company: { select: companySelect } },
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
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    municipality: user.municipality ?? null,
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
    include: { municipality: true, company: { select: companySelect } },
  });
  if (!user) {
    return res.status(401).json({ error: "セッションが無効です。再度ログインしてください" });
  }
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    municipality: user.municipality ?? null,
    company: user.company ?? null,
  });
});

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

// Account settings: update the signed-in user's own name/email (any role).
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
  res.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role });
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
