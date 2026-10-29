import { useEffect, useRef, useState } from "react";

const CLIENT_KEY = "jaziba-live-client";

// A random id for this browser tab, so the server counts it once even when
// it reconnects (sessionStorage is per tab).
export function tabId() {
  try {
    let id = sessionStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      sessionStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

// How many tabs have this spot open right now (GET /reels/:id/live, Server-
// Sent Events), or null until known. Disconnects while the tab is hidden, so
// a background tab isn't counted as someone looking. `onReaction` gets other
// people's live reactions on the same reel.
export function useLiveViewers(reelId: string | undefined, onReaction?: (reaction: string) => void) {
  const [count, setCount] = useState<number | null>(null);
  const onReactionRef = useRef(onReaction);
  onReactionRef.current = onReaction;

  useEffect(() => {
    if (!reelId || typeof EventSource === "undefined") return;
    const client = tabId();
    let source: EventSource | null = null;
    const connect = () => {
      if (source || document.visibilityState === "hidden") return;
      source = new EventSource(`/api/reels/${encodeURIComponent(reelId)}/live?client=${client}`);
      source.addEventListener("count", (e) => setCount(Number((e as MessageEvent).data)));
      source.addEventListener("reaction", (e) => {
        try {
          const { reaction, from } = JSON.parse((e as MessageEvent).data) as { reaction: string; from: string };
          if (from !== client) onReactionRef.current?.(reaction);
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
      setCount(null);
    };
  }, [reelId]);

  return count;
}
