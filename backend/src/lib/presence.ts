import type { Response } from "express";

// いま見ている人数: who has a spot's page open right now, kept in memory on
// this server (one instance on Render) and pushed to every open page over
// Server-Sent Events. Only a count leaves the server — never who. Each
// browser tab sends a random id, so a reconnecting tab isn't counted twice.

const watchers = new Map<string, Map<string, Set<Response>>>();
let connections = 0;
// Beyond this many open streams new ones are refused, so a flood of
// connections can't exhaust the server.
export const MAX_CONNECTIONS = 2000;

export function viewerCount(reelId: string) {
  return watchers.get(reelId)?.size ?? 0;
}

function broadcast(reelId: string) {
  const count = viewerCount(reelId);
  for (const streams of watchers.get(reelId)?.values() ?? []) {
    for (const res of streams) res.write(`event: count\ndata: ${count}\n\n`);
  }
}

// Returns false when the server is at its connection limit.
export function watch(reelId: string, clientId: string, res: Response, onClose: (fn: () => void) => void) {
  if (connections >= MAX_CONNECTIONS) return false;
  connections++;
  let byClient = watchers.get(reelId);
  if (!byClient) watchers.set(reelId, (byClient = new Map()));
  let streams = byClient.get(clientId);
  if (!streams) byClient.set(clientId, (streams = new Set()));
  streams.add(res);
  broadcast(reelId);

  // Comments keep proxies from closing an idle stream.
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
  onClose(() => {
    clearInterval(heartbeat);
    connections--;
    streams!.delete(res);
    if (streams!.size === 0) byClient!.delete(clientId);
    if (byClient!.size === 0) watchers.delete(reelId);
    broadcast(reelId);
  });
  return true;
}
