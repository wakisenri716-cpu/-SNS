import { CLAUDE_MODEL, getClaudeClient } from "./claude";

const LANGUAGE_NAMES: Record<string, string> = { en: "English", zh: "Simplified Chinese", ko: "Korean", ja: "Japanese" };

const SYSTEM_PROMPT = `You translate captions written by Japanese municipalities and local businesses for a tourism app, for travelers visiting Japan.
Translate faithfully and naturally. Keep place names recognizable: romanize or use the standard local name, and keep the original Japanese in parentheses the first time a proper noun appears if that helps a traveler find it. Do not add, remove or explain information. If the text is already in the target language, return it unchanged.
Output only the translated text.`;

// Translates one caption with Claude. Throws on failure or a declined
// request; the caller decides how to report it.
export async function translateCaption(caption: string, lang: string): Promise<string> {
  const response = await getClaudeClient().beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Translating a short caption needs little deliberation.
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Translate into ${LANGUAGE_NAMES[lang] ?? "English"}.\n\n<caption>\n${caption}\n</caption>`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`translation stopped: ${response.stop_reason}`);
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("translation returned no text");
  return text;
}
