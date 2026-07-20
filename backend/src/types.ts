export type Role = "USER" | "MUNICIPALITY";

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
