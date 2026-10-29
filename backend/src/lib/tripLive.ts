import { randomBytes } from "node:crypto";
import type { Response } from "express";

// 共同編集のライブ: everyone with a trip's しおり open hears, over Server-Sent
// Events, when someone else changes it ("changed" — they reload) and who is
// looking at it right now ("presence"). EventSource can't send the auth
// header, so the app first gets a one-time ticket (60 s) with its normal
// session and opens the stream with that.

interface Viewer {
  userId: string;
  name: string;
  res: Response;
}

const tickets = new Map<string, { tripId: string; userId: string; name: string; expires: number }>();
const viewers = new Map<string, Set<Viewer>>();
let connections = 0;
const MAX_CONNECTIONS = 1000;

export function issueTicket(tripId: string, userId: string, name: string) {
  const now = Date.now();
  for (const [k, v] of tickets) if (v.expires < now) tickets.delete(k);
  const ticket = randomBytes(18).toString("base64url");
  tickets.set(ticket, { tripId, userId, name, expires: now + 60_000 });
  return ticket;
}

// Uses up a ticket; null if unknown or expired.
export function redeemTicket(ticket: string) {
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  return entry && entry.expires >= Date.now() ? entry : null;
}

function send(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcastPresence(tripId: string) {
  const set = viewers.get(tripId);
  if (!set) return;
  // Each person once, however many tabs.
  const people = [...new Map([...set].map((v) => [v.userId, { id: v.userId, name: v.name }])).values()];
  for (const v of set) send(v.res, "presence", { people });
}

export function joinTripLive(tripId: string, userId: string, name: string, res: Response, onClose: (fn: () => void) => void) {
  if (connections >= MAX_CONNECTIONS) return false;
  connections++;
  const viewer = { userId, name, res };
  let set = viewers.get(tripId);
  if (!set) viewers.set(tripId, (set = new Set()));
  set.add(viewer);
  broadcastPresence(tripId);
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
  onClose(() => {
    clearInterval(heartbeat);
    connections--;
    set!.delete(viewer);
    if (set!.size === 0) viewers.delete(tripId);
    broadcastPresence(tripId);
  });
  return true;
}

// Someone changed the trip: tell everyone else looking at it.
export function tripChanged(tripId: string, by: { id: string; name: string }) {
  for (const v of viewers.get(tripId) ?? []) send(v.res, "changed", { by });
}
