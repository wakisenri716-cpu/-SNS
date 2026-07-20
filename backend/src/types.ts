export type Role = "USER" | "MUNICIPALITY" | "COMPANY";

export interface AuthTokenPayload {
  userId: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export {};
