import { haversineMeters } from "./googleMaps";
import { CLAUDE_MODEL, getClaudeClient, isClaudeConfigured, logClaudeError } from "./claude";
import { keywordScore, type ConciergeCandidate, type ConciergePick } from "./concierge";
import { nearestPath } from "./tripPlanner";

// "AIで旅をつくる": the traveler describes a whole trip ("2泊3日で長野、温泉と
// お城") and gets a ready しおり built from Jaziba's posts — which places, in
// what order, how long at each, and a name. Only proposes; the traveler
// reviews it and the client creates the trip if they accept.
//
// With ANTHROPIC_API_KEY, Claude chooses and orders posts from the list it is
// shown (ids constrained by the schema). Without it — or on failure — the
// concierge's keyword matching picks the posts and a distance-based route
// orders them; the response says which one built it.

export interface ComposeCandidate extends ConciergeCandidate {
  lat: number;
  lng: number;
}

export interface ComposedStop {
  id: string;
  stayMinutes: number;
  /** 1-based day: a place to stay that isn't last ends a day (as in the しおり). */
  day: number;
  reason: string | null;
  matched: ConciergePick["matched"];
}

export interface ComposeResult {
  mode: "ai" | "keyword";
  name: string;
  summary: string | null;
  /** Days the request asked for; the stops' own `day` is what the しおり will show. */
  requestedDays: number;
  stops: ComposedStop[];
}

const MAX_DAYS = 7;
const VISITS_PER_DAY = 3;
const MAX_STOPS = 16;

const KANJI_DIGITS: Record<string, string> = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7" };

// How many days the traveler means: "2泊3日", "3日間", "日帰り", "3 days",
// "2 nights", "3天", "2박3일". 1 when not stated.
export function wantedDays(message: string) {
  const text = message.normalize("NFKC").replace(/[一二三四五六七](?=\s*[泊日天])/g, (k) => KANJI_DIGITS[k]).toLowerCase();
  const clamp = (n: number) => Math.min(MAX_DAYS, Math.max(1, n));
  let m: RegExpMatchArray | null;
  if ((m = text.match(/(\d+)\s*[泊박]\s*(\d+)\s*[日일天]/))) return clamp(Number(m[2]));
  if ((m = text.match(/(\d+)\s*(?:泊|박|晚|nights?)/))) return clamp(Number(m[1]) + 1);
  if (/日帰り|day trip|一日游|당일/.test(text)) return 1;
  if ((m = text.match(/(\d+)\s*(?:日間|天|일간|-?\s*days?\b)/))) return clamp(Number(m[1]));
  return 1;
}

function defaultStay(category: string) {
  return ({ nature: 90, culture: 60, activity: 120, restaurant: 60, lodging: 60 } as Record<string, number>)[category] ?? 60;
}

// Days follow the しおり's own rule: a place to stay before the last stop is a night there.
function withDays<T extends { category: string }>(stops: T[]) {
  let day = 1;
  return stops.map((s, i) => {
    const out = { stop: s, day };
    if (s.category === "lodging" && i < stops.length - 1) day += 1;
    return out;
  });
}

function nameFrom(message: string) {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > 40 ? `${flat.slice(0, 39)}…` : flat;
}

// ---- Keyword mode ---------------------------------------------------------

// The best keyword matches near the best one (so a trip doesn't hop between
// regions), routed by distance and split into days, each ending at a place to
// stay when one matched.
function keywordCompose(message: string, candidates: ComposeCandidate[]): ComposeResult {
  const days = wantedDays(message);
  const scored = keywordScore(message, candidates);
  const empty: ComposeResult = { mode: "keyword", name: nameFrom(message), summary: null, requestedDays: days, stops: [] };
  if (scored.length === 0) return empty;

  const anchor = scored[0].c as ComposeCandidate;
  const radius = (days > 1 ? 150 : 60) * 1000;
  const near = scored.filter((s) => haversineMeters(anchor, s.c as ComposeCandidate) <= radius);
  const matched = new Map(near.map((s) => [s.c.id, s.matched]));
  const visits = near
    .filter((s) => s.c.category !== "lodging")
    .slice(0, Math.min(days * VISITS_PER_DAY, MAX_STOPS))
    .map((s) => s.c as ComposeCandidate);
  // One place to stay per night; on a day trip only when asked for (an onsen
  // inn for "温泉", say), as the last stop.
  const lodging = near
    .filter((s) => s.c.category === "lodging" && (days > 1 || s.matched.category))
    .slice(0, Math.max(1, days - 1))
    .map((s) => s.c as ComposeCandidate);

  // Route through all the visits, then cut it into one leg per night and end
  // each leg at the (remaining) place to stay nearest to it.
  const route = visits.length > 0 ? nearestPath(farthestFromCentre(visits), visits) : [];
  const nights = Math.min(days - 1, lodging.length);
  const legs = nights + 1;
  const perLeg = Math.ceil(route.length / legs) || 0;
  const ordered: ComposeCandidate[] = [];
  const stays = [...lodging];
  for (let leg = 0; leg < legs; leg++) {
    const part = route.slice(leg * perLeg, (leg + 1) * perLeg);
    ordered.push(...part);
    const last = part.at(-1) ?? ordered.at(-1) ?? anchor;
    if (leg < nights || (days === 1 && stays.length > 0 && leg === legs - 1)) {
      const i = stays.reduce((best, s, j) => (haversineMeters(last, s) < haversineMeters(last, stays[best]) ? j : best), 0);
      ordered.push(stays.splice(i, 1)[0]);
    }
  }

  return {
    ...empty,
    stops: withDays(ordered).map(({ stop, day }) => ({
      id: stop.id,
      stayMinutes: defaultStay(stop.category),
      day,
      reason: null,
      matched: matched.get(stop.id) ?? null,
    })),
  };
}

// The route starts at an end, not in the middle (see tripPlanner's autoPlan).
function farthestFromCentre<T extends { lat: number; lng: number }>(points: T[]) {
  const centre = {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
  return points.reduce((far, p) => (haversineMeters(centre, p) > haversineMeters(centre, far) ? p : far));
}

// ---- AI mode --------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = { ja: "Japanese", en: "English", zh: "Simplified Chinese", ko: "Korean" };

const SYSTEM_PROMPT = `You build trips for travelers on Jaziba, a tourism social network where municipalities and local businesses post short videos about places in Japan.
The traveler describes the trip they want. You are given the posts on Jaziba (place, coordinates, category, tags, best_months and the poster's caption) as JSON. Build a trip itinerary from those posts only:

- Choose the posts that fit the request (at most ${MAX_STOPS}; about ${VISITS_PER_DAY} places to visit per day, plus meals if they fit) and put them in visiting order. Keep each day geographically compact using the coordinates, and avoid backtracking. A trip should stay in one area unless the traveler asks otherwise.
- The app treats a post with category "lodging" that is not the last stop as the night's stay: the next stop starts the following day. So for a trip of several days, end each day except the last with one lodging post when there is a suitable one; never put lodging in the middle of a day. If there is no lodging post nearby, leave it out rather than choosing a far one.
- Give each stop a stay length in minutes (multiples of 15, 15 to 240; it is ignored for a night's stay) and a one-sentence reason that refers only to what that post's data says.
- Give the trip a short name (at most 20 characters, like "長野 温泉と城めぐり 2泊3日") and a two-sentence summary.

Do not add facts about the places (opening hours, prices, access, accessibility, seasons) that the data does not state. If nothing fits, return no stops and use the summary to say so kindly and suggest what to ask instead. Write the name, reasons and summary in the requested language.`;

async function aiCompose(message: string, lang: string, candidates: ComposeCandidate[]): Promise<ComposeResult> {
  const ids = candidates.map((c) => c.id);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const days = wantedDays(message);
  const posts = candidates.map((c) => ({
    id: c.id,
    place: c.locationName,
    municipality: c.municipalityName,
    prefecture: c.prefecture,
    lat: Number(c.lat.toFixed(4)),
    lng: Number(c.lng.toFixed(4)),
    category: c.category,
    tags: c.travelerTags,
    best_months: c.bestMonths,
    caption: c.caption.slice(0, 200),
  }));

  const response = await getClaudeClient().beta.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              summary: { type: "string" },
              stops: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", enum: ids },
                    stayMinutes: { type: "integer" },
                    reason: { type: "string" },
                  },
                  required: ["id", "stayMinutes", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["name", "summary", "stops"],
            additionalProperties: false,
          },
        },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Answer in ${LANGUAGE_NAMES[lang] ?? "Japanese"}. ${
            days > 1 ? `The request reads as a ${days}-day trip.` : "Infer the number of days from the request (a day trip if it doesn't say)."
          }\n\n<posts>\n${JSON.stringify(posts)}\n</posts>\n\n<traveler_request>\n${message}\n</traveler_request>`,
        },
      ],
    },
    // Building a whole trip takes longer than the client's default timeout.
    { timeout: 60_000 }
  );
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`compose stopped: ${response.stop_reason}`);
  }
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("compose returned no text");
  const parsed = JSON.parse(block.text) as { name: string; summary: string; stops: { id: string; stayMinutes: number; reason: string }[] };

  const seen = new Set<string>();
  const chosen = parsed.stops
    .filter((s) => byId.has(s.id) && !seen.has(s.id) && seen.add(s.id))
    .slice(0, MAX_STOPS)
    .map((s) => ({ ...s, category: byId.get(s.id)!.category }));
  const stops = withDays(chosen).map(({ stop, day }) => ({
    id: stop.id,
    stayMinutes: Math.min(240, Math.max(15, Math.round(stop.stayMinutes / 15) * 15)),
    day,
    reason: stop.reason || null,
    matched: null,
  }));
  return {
    mode: "ai",
    name: nameFrom(parsed.name) || nameFrom(message),
    summary: parsed.summary || null,
    requestedDays: days,
    stops,
  };
}

export async function composeTrip(message: string, lang: string, candidates: ComposeCandidate[]): Promise<ComposeResult> {
  if (isClaudeConfigured() && candidates.length > 0) {
    try {
      return await aiCompose(message, lang, candidates);
    } catch (err) {
      logClaudeError("trip compose, using keyword matching", err);
    }
  }
  return keywordCompose(message, candidates);
}
