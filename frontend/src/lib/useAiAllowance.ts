import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { PointsSummary } from "../types";

/** This account's AI uses left (GET /points), or null when not signed in / not loaded. */
export function useAiAllowance(refreshKey: unknown = 0) {
  const { token } = useAuth();
  const [ai, setAi] = useState<PointsSummary["ai"] | null>(null);
  useEffect(() => {
    if (!token) return setAi(null);
    let alive = true;
    api
      .get<PointsSummary>("/points")
      .then(({ data }) => alive && setAi(data.ai))
      .catch(() => alive && setAi(null));
    return () => {
      alive = false;
    };
  }, [token, refreshKey]);
  return ai;
}
