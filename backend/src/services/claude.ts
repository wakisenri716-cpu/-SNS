import Anthropic from "@anthropic-ai/sdk";

// Shared Claude client for the AI features (concierge, caption translation).
// They are all optional: without ANTHROPIC_API_KEY each one falls back or
// hides itself, and says so in the UI.
export const CLAUDE_MODEL = "claude-opus-5-5";

export function isClaudeConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
export function getClaudeClient() {
  client ??= new Anthropic({ timeout: 25_000, maxRetries: 1 });
  return client;
}

export function logClaudeError(feature: string, err: unknown) {
  if (err instanceof Anthropic.RateLimitError) console.warn(`[${feature}] rate limited`);
  else if (err instanceof Anthropic.APIError) console.error(`[${feature}] API error ${err.status}: ${err.message}`);
  else console.error(`[${feature}]`, err);
}
