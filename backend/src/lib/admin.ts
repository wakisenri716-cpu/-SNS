import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma";

// The operator's admin console (/admin). Who may use it: the accounts whose
// email address is in ADMIN_EMAILS (comma-separated), set on the server only,
// so nobody can make themselves an admin from the app.
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
export const isAdminEmail = (email: string) => adminEmails().includes(email.toLowerCase());

/** After requireAuth: only admins; sets req.admin. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.auth ? await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { id: true, name: true, email: true } }) : null;
  if (!user || !isAdminEmail(user.email)) return res.status(403).json({ error: "管理者だけが使えます" });
  req.admin = { id: user.id, name: user.name };
  next();
}

export async function logAdmin(req: Request, action: string, targetId = "", detail = "") {
  await prisma.adminLog.create({ data: { adminId: req.admin!.id, adminName: req.admin!.name, action, targetId, detail: detail.slice(0, 500) } });
}

// 利用停止: kept in memory too, so every request can be checked without a
// database read (one server instance; loaded at start, updated on change).
const suspended = new Set<string>();
export const isSuspended = (userId: string) => suspended.has(userId);
export function setSuspended(userId: string, on: boolean) {
  if (on) suspended.add(userId);
  else suspended.delete(userId);
}
export async function loadSuspendedUsers() {
  const rows = await prisma.user.findMany({ where: { suspendedAt: { not: null } }, select: { id: true } });
  suspended.clear();
  for (const r of rows) suspended.add(r.id);
}
