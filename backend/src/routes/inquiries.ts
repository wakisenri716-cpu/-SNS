import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  message: z.string().min(1).max(2000),
});

// Public contact form submission — no login required.
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await prisma.inquiry.create({ data: parsed.data });
  res.status(201).json({ ok: true });
});

export default router;
