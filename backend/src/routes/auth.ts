import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma";
import { JWT_SECRET } from "../middleware/auth";

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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function issueToken(userId: string, role: "USER" | "MUNICIPALITY") {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });
}

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

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { municipality: true },
  });
  if (!user) {
    return res.status(401).json({ error: "メールアドレスまたはパスワードが違います" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "メールアドレスまたはパスワードが違います" });
  }

  const token = issueToken(user.id, user.role as "USER" | "MUNICIPALITY");
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    municipality: user.municipality ?? null,
  });
});

export default router;
