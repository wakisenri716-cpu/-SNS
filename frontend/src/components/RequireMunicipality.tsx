import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function RequireMunicipality({ children }: { children: ReactNode }) {
  const { municipality, ready } = useAuth();
  if (!ready) return null;
  if (!municipality) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
