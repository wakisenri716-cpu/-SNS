import type { Request, Response } from "express";
import { prisma } from "../prisma";

// Resolves the municipality/company a MUNICIPALITY or COMPANY user is allowed to
// post as. Returns null (with the response already sent) if their profile is
// missing — e.g. the demo database reset independently of their login token.
export async function resolvePosterContext(
  req: Request,
  res: Response
): Promise<{ municipalityId: string; companyId: string | null } | null> {
  if (req.auth!.role === "MUNICIPALITY") {
    const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
    if (!municipality) {
      res.status(404).json({ error: "自治体プロフィールが見つかりません" });
      return null;
    }
    return { municipalityId: municipality.id, companyId: null };
  }

  const company = await prisma.company.findUnique({ where: { userId: req.auth!.userId } });
  if (!company) {
    res.status(404).json({ error: "企業プロフィールが見つかりません" });
    return null;
  }
  return { municipalityId: company.municipalityId, companyId: company.id };
}
