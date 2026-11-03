import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma";

// The operator's admin console (/admin). Who may use it: the accounts whose
// email address is in ADMIN_EMAILS (comma-separated), set on the server only,
// so nobody can make themselves an admin from the app.
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    // Commas, spaces or line breaks between addresses (a stray line break
    // pasted into the Render box shouldn't lock the operator out).
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
export const isAdminEmail = (email: string) => adminEmails().includes(email.toLowerCase());

/** After requireAuth: only admins; sets req.admin. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.auth ? await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { id: true, name: true, email: true } }) : null;
  // A sign-in from before the database was reset: 401 so the app signs out.
  if (!user) return res.status(401).json({ error: "もう一度ログインしてください" });
  // `configured` says whether ADMIN_EMAILS is set at all, so the page can
  // tell "not set on the server (yet)" from "not this account".
  if (!isAdminEmail(user.email)) return res.status(403).json({ code: "notAdmin", configured: adminEmails().length > 0, error: "管理者だけが使えます" });
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

// 登録の承認: municipality and company accounts wait for the operator before
// they can post or edit (POSTER_APPROVAL=off turns this off, e.g. for a demo).
export const approvalRequired = () => process.env.POSTER_APPROVAL !== "off";
const unapproved = new Set<string>();
/** Waiting for (or refused) approval: may sign in and look, not post or edit. */
export const isUnapproved = (userId: string) => approvalRequired() && unapproved.has(userId);
export function setApproval(userId: string, approval: string) {
  if (approval === "approved") unapproved.delete(userId);
  else unapproved.add(userId);
}
export async function loadUnapprovedPosters() {
  const rows = await prisma.user.findMany({ where: { approval: { not: "approved" } }, select: { id: true } });
  unapproved.clear();
  for (const r of rows) unapproved.add(r.id);
}
export const PENDING_APPROVAL = { code: "pendingApproval", error: "運営の確認が終わるまで、投稿や情報の編集はできません" };
