import { useEffect, useState } from "react";
import { api } from "../api/client";

// { reelId: viewers } for spots someone has open right now
// (GET /reels/live-counts), refreshed every 20 seconds while the tab is
// visible.
export function useLiveCounts(enabled = true) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      api
        .get<{ counts: Record<string, number> }>("/reels/live-counts")
        .then(({ data }) => alive && setCounts(data.counts))
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 20_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [enabled]);

  return counts;
}
