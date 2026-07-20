import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function RequireCompany({ children }: { children: ReactNode }) {
  const { company, ready } = useAuth();
  if (!ready) return null;
  if (!company) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
