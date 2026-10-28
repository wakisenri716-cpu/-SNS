import { haversineMeters } from "./googleMaps";
import { CLAUDE_MODEL, getClaudeClient, isClaudeConfigured, logClaudeError } from "./claude";

// "AIでプランを作る" for the しおり: proposes a visiting order and how long to
// stay at each saved spot, plus a short summary. The user reviews it and
// chooses whether to apply it — nothing is changed here.
//
// With ANTHROPIC_API_KEY, Claude plans from the spots' own data and the
// traveler's wishes. Otherwise (or on failure) a plain route optimizer orders
// the stops by distance — nearest next stop, lodging last — and keeps the
// stay times; the response says which one planned it.

export interface PlanStopInput {
  id: string;
  name: string;
  municipality: string;
  category: string;
  caption: string;
  lat: number | null;
  lng: number | null;
  stayMinutes: number;
}

export interface PlanResult {
  mode: "ai" | "auto";
  summary: string | null;
  stops: { id: string; stayMinutes: number; note: string | null }[];
}

type Located = PlanStopInput & { lat: number; lng: number };

const dist = (a: Located, b: Located) => haversineMeters(a, b);

// Greedy nearest-next-stop path through `stops`, starting from `start`
// (which is not itself part of the returned path).
function nearestPath(start: Located, stops: Located[]): Located[] {
  const path: Located[] = [];
  const remaining = [...stops];
  let current = start;
  while (remaining.length > 0) {
    let best = 0;
    remaining.forEach((s, i) => {
      if (dist(current, s) < dist(current, remaining[best])) best = i;
    });
    current = remaining.splice(best, 1)[0];
    path.push(current);
  }
  return path;
}

// Route-optimizer fallback. The day ends at the (first) place to stay, so the
// path is built backwards from it and reversed — the stop nearest the hotel
// comes last. Without lodging it starts from the stop farthest from the
// others' centre, so the route runs end to end instead of doubling back.
// Stops without coordinates keep their order after the route; extra lodging
// goes at the very end. Stay times are left as they are.
function autoPlan(stops: PlanStopInput[]): PlanResult {
  const located = stops.filter((s): s is Located => s.lat != null && s.lng != null);
  const unlocated = stops.filter((s) => s.lat == null || s.lng == null);
  const lodging = located.filter((s) => s.category === "lodging");
  const visits = located.filter((s) => s.category !== "lodging");

  let route: Located[];
  if (lodging.length > 0) {
    route = [...nearestPath(lodging[0], visits).reverse(), lodging[0], ...lodging.slice(1)];
  } else if (visits.length > 0) {
    const centre = {
      lat: visits.reduce((sum, s) => sum + s.lat, 0) / visits.length,
      lng: visits.reduce((sum, s) => sum + s.lng, 0) / visits.length,
    } as Located;
    const first = visits.reduce((far, s) => (dist(centre, s) > dist(centre, far) ? s : far));
    route = [first, ...nearestPath(first, visits.filter((s) => s !== first))];
  } else {
    route = [];
  }
  return {
    mode: "auto",
    summary: null,
    stops: [...route, ...unlocated].map((s) => ({ id: s.id, stayMinutes: s.stayMinutes, note: null })),
  };
}

const LANGUAGE_NAMES: Record<string, string> = { ja: "Japanese", en: "English", zh: "Simplified Chinese", ko: "Korean" };

const SYSTEM_PROMPT = `You plan a trip for a traveler using Jaziba, a tourism app for Japan. You get the spots they saved (with coordinates, category and the poster's caption) and, optionally, their wishes.
Return the visiting order (every spot exactly once), a sensible stay length for each in minutes (multiples of 15, between 15 and 240), a short practical note per spot, and a two-sentence summary of the plan.

Order spots to avoid backtracking, using the coordinates; put meals near usual meal times and a place to stay at the end of the day. The app treats a place to stay that is not the last stop as a night there, continuing the next morning at the start time, so with several places to stay plan one day per place to stay, each day ending at one (its stay length is ignored). Base notes only on what the spot data says plus general, non-factual advice (for example "a good place for lunch"); do not state opening hours, prices, reservations, accessibility or seasonal facts that the data does not contain. Write the notes and summary in the requested language.`;

async function aiPlan(stops: PlanStopInput[], wishes: string, startTime: string, lang: string): Promise<PlanResult> {
  const ids = stops.map((s) => s.id);
  const response = await getClaudeClient().beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            stops: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", enum: ids },
                  stayMinutes: { type: "integer" },
                  note: { type: "string" },
                },
                required: ["id", "stayMinutes", "note"],
                additionalProperties: false,
              },
            },
          },
          required: ["summary", "stops"],
          additionalProperties: false,
        },
      },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Answer in ${LANGUAGE_NAMES[lang] ?? "Japanese"}. The day starts at ${startTime}.\n\n<spots>\n${JSON.stringify(
          stops.map((s) => ({ ...s, caption: s.caption.slice(0, 240) }))
        )}\n</spots>\n\n<wishes>\n${wishes || "(none)"}\n</wishes>`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`plan stopped: ${response.stop_reason}`);
  }
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("plan returned no text");
  const parsed = JSON.parse(block.text) as { summary: string; stops: { id: string; stayMinutes: number; note: string }[] };

  // Keep each spot once; anything the model left out goes at the end unchanged.
  const seen = new Set<string>();
  const planned = parsed.stops
    .filter((s) => ids.includes(s.id) && !seen.has(s.id) && seen.add(s.id))
    .map((s) => ({
      id: s.id,
      stayMinutes: Math.min(240, Math.max(15, Math.round(s.stayMinutes / 15) * 15)),
      note: s.note || null,
    }));
  const missing = stops.filter((s) => !seen.has(s.id)).map((s) => ({ id: s.id, stayMinutes: s.stayMinutes, note: null }));
  return { mode: "ai", summary: parsed.summary, stops: [...planned, ...missing] };
}

export async function planTrip(stops: PlanStopInput[], wishes: string, startTime: string, lang: string): Promise<PlanResult> {
  if (isClaudeConfigured()) {
    try {
      return await aiPlan(stops, wishes, startTime, lang);
    } catch (err) {
      logClaudeError("trip plan, using distance ordering", err);
    }
  }
  return autoPlan(stops);
}
