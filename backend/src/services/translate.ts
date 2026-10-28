import { CLAUDE_MODEL, getClaudeClient } from "./claude";

const LANGUAGE_NAMES: Record<string, string> = { en: "English", zh: "Simplified Chinese", ko: "Korean", ja: "Japanese" };

const CAPTION_PROMPT = `You translate captions written by Japanese municipalities and local businesses for a tourism app, for travelers visiting Japan.
Translate faithfully and naturally. Keep place names recognizable: romanize or use the standard local name, and keep the original Japanese in parentheses the first time a proper noun appears if that helps a traveler find it. Do not add, remove or explain information. If the text is already in the target language, return it unchanged.
Output only the translated text.`;

const COMMENT_PROMPT = `You translate comments that travelers and local accounts post under videos in a tourism app for Japan. The comment may be in any language.
Translate faithfully and naturally, keeping the tone (casual stays casual) and emoji. Keep place names recognizable. Do not add, remove, soften or explain anything. If the text is already in the target language, return it unchanged.
Output only the translated text.`;

// Translates one caption or comment with Claude. Throws on failure or a
// declined request; the caller decides how to report it.
export async function translateCaption(caption: string, lang: string, kind: "caption" | "comment" = "caption"): Promise<string> {
  const response = await getClaudeClient().beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Translating a short caption needs little deliberation.
    output_config: { effort: "low" },
    system: kind === "comment" ? COMMENT_PROMPT : CAPTION_PROMPT,
    messages: [
      {
        role: "user",
        content: `Translate into ${LANGUAGE_NAMES[lang] ?? "English"}.\n\n<${kind}>\n${caption}\n</${kind}>`,
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
