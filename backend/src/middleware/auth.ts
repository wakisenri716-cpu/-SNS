import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AuthTokenPayload, Role } from "../types";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "認証が必要です" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: "トークンが無効です" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "権限がありません" });
    }
    next();
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length);
    try {
      req.auth = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}

export { JWT_SECRET };
