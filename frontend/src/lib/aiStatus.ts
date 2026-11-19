import { useEffect, useState } from "react";
import { api } from "../api/client";

// From GET /concierge/status, fetched once per page load and shared:
// - ai: whether the server has Claude configured (AI-only buttons are hidden
//   when it isn't);
// - extras: whether the AI beyond the しおり is switched on (the concierge,
//   photo search, translation, comment summaries, caption help, reading
//   transit files). It's off for now (backend lib/aiFeatures.ts).
type AiStatus = { ai: boolean; extras: boolean };
let request: Promise<AiStatus> | null = null;

function fetchAiStatus() {
  request ??= api
    .get<{ ai: boolean; extras?: boolean }>("/concierge/status")
    .then(({ data }) => ({ ai: data.ai, extras: data.extras === true }))
    .catch(() => ({ ai: false, extras: false }));
  return request;
}

function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchAiStatus().then((v) => alive && setStatus(v));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

export function useAiAvailable() {
  const status = useAiStatus();
  return status ? status.ai : null;
}

/** Whether the AI beyond the しおり is on (null while loading). */
export function useExtraAi() {
  const status = useAiStatus();
  return status ? status.extras : null;
}
