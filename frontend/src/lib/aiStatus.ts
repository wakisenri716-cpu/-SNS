import { useEffect, useState } from "react";
import { api } from "../api/client";

// Whether the server has Claude configured (GET /concierge/status), fetched
// once per page load and shared — AI-only buttons such as "翻訳を見る" are
// hidden when it isn't.
let request: Promise<boolean> | null = null;

function fetchAiAvailable() {
  request ??= api
    .get<{ ai: boolean }>("/concierge/status")
    .then(({ data }) => data.ai)
    .catch(() => false);
  return request;
}

export function useAiAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchAiAvailable().then((v) => alive && setAvailable(v));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}
