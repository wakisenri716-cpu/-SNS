// 自分のAIで続ける: open the traveler's own ChatGPT or Claude with the trip
// or the conversation already written in, so they can go on there with their
// own account (no Jaziba AI use, no cost to Jaziba). Nothing is sent by
// Jaziba — the browser opens the other service with the text in its address.
export type OwnAi = "chatgpt" | "claude";

// Long addresses can be refused, so the text is kept short.
export const MAX_PROMPT_CHARS = 1500;

export const ownAiUrl = (ai: OwnAi, prompt: string) =>
  ai === "chatgpt" ? `https://chatgpt.com/?q=${encodeURIComponent(prompt)}` : `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;

/** Cut to the limit at a line break where possible. */
export function clampPrompt(text: string, max = MAX_PROMPT_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const nl = cut.lastIndexOf("\n");
  return `${nl > max * 0.6 ? cut.slice(0, nl) : cut}…`;
}

export interface PromptStop {
  name: string;
  place: string;
  /** "09:30" when the timeline has a time for it. */
  arrive?: string;
  stayMinutes: number;
}

export interface TripPromptLabels {
  intro: string;
  ask: string;
  date: (d: string) => string;
  origin: (o: string) => string;
  start: (t: string) => string;
  stops: string;
  stay: (min: number) => string;
}

/** The しおり as plain text, with the question to ask last (it survives the cut). */
export function tripPrompt(
  trip: { name: string; date: string | null; origin: string; startTime: string; stops: PromptStop[] },
  l: TripPromptLabels
): string {
  const head = [l.intro, `「${trip.name}」`, trip.date && l.date(trip.date), trip.origin && l.origin(trip.origin), trip.startTime && l.start(trip.startTime)]
    .filter(Boolean)
    .join("\n");
  const stops = trip.stops.map((s, i) => `${i + 1}. ${[s.arrive, s.name, s.place && `(${s.place})`, l.stay(s.stayMinutes)].filter(Boolean).join(" ")}`);
  const ask = `\n${l.ask}`;
  return `${clampPrompt(`${head}\n${l.stops}\n${stops.join("\n")}`, MAX_PROMPT_CHARS - ask.length)}${ask}`;
}

/** The concierge conversation so far, newest last, for asking more elsewhere. */
export function conversationPrompt(
  turns: { question: string; reply: string; picks: string[] }[],
  l: { intro: string; ask: string; me: string; ai: string; picks: string }
): string {
  const ask = `\n${l.ask}`;
  const body = turns
    .map((t) => [`${l.me}: ${t.question}`, t.reply && `${l.ai}: ${t.reply}`, t.picks.length > 0 && `${l.picks}: ${t.picks.join("、")}`].filter(Boolean).join("\n"))
    .join("\n\n");
  // Keep the latest turns when it's too long.
  const room = MAX_PROMPT_CHARS - ask.length - l.intro.length - 2;
  const kept = body.length > room ? `…${body.slice(body.length - room + 1)}` : body;
  return `${l.intro}\n\n${kept}${ask}`;
}
