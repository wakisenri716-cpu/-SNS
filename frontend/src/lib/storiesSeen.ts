import { useSyncExternalStore } from "react";

// Which posts this device has already watched as stories, so their ring
// turns gray. Kept in localStorage (per device, nothing sent to the server).
const KEY = "jaziba-stories-seen";
const MAX = 500;
const listeners = new Set<() => void>();
let cache: Set<string> | null = null;

function load(): Set<string> {
  if (cache) return cache;
  try {
    cache = new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    cache = new Set();
  }
  return cache;
}

export function markStorySeen(reelId: string) {
  const seen = load();
  if (seen.has(reelId)) return;
  const next = new Set(seen);
  next.add(reelId);
  cache = new Set([...next].slice(-MAX));
  try {
    localStorage.setItem(KEY, JSON.stringify([...cache]));
  } catch {
    // Storage unavailable: remember for this visit only.
  }
  listeners.forEach((l) => l());
}

export function useSeenStories() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    load
  );
}
