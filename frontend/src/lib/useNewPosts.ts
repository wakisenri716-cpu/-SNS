import { useEffect, useState } from "react";

// Ids of posts published since the feed was opened (GET /reels/feed/live,
// Server-Sent Events), for "新しい投稿があります". Disconnects while the tab
// is hidden; reset() after showing them.
export function useNewPosts(enabled: boolean) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    const connect = () => {
      if (source || document.visibilityState === "hidden") return;
      source = new EventSource("/api/reels/feed/live");
      source.addEventListener("post", (e) => {
        try {
          const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
          setIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        } catch {
          // Ignore a malformed event.
        }
      });
      source.addEventListener("busy", () => disconnect());
    };
    const disconnect = () => {
      source?.close();
      source = null;
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? disconnect() : connect());
    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      disconnect();
    };
  }, [enabled]);

  return { ids, reset: () => setIds([]) };
}
