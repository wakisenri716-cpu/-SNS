import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function RequirePoster({ children }: { children: ReactNode }) {
  const { municipality, company, ready } = useAuth();
  if (!ready) return null;
  if (!municipality && !company) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
