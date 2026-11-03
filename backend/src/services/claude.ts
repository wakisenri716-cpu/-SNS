import Anthropic from "@anthropic-ai/sdk";

// Shared Claude client for the AI features (concierge, caption translation).
// They are all optional: without ANTHROPIC_API_KEY each one falls back or
// hides itself, and says so in the UI.
// Sonnet 5.5 by default: the AI features (picking from a list, ordering a
// trip) don't need the top model, and it costs half as much as Opus 5.5.
// CLAUDE_MODEL overrides it (e.g. "claude-opus-5-5").
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

// What one request used, for the AI usage log (AiUsage, lib/aiQuota.ts).
export interface AiUsageInfo {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function usageOf(response: {
  model?: string;
  usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
}): AiUsageInfo {
  const u = response.usage;
  return {
    model: response.model ?? CLAUDE_MODEL,
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
  };
}

// List prices in US$ per million tokens (Anthropic API, as of 2026-10) —
// for the cost estimate in the usage log and the budget cap; the invoice is
// what counts. Cache writes (5-minute) are 1.25× input.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/** Estimated cost of one request in millionths of a US$. Unknown models are priced as Opus 5.5. */
export function estimateCostMicroUsd(u: AiUsageInfo) {
  const known = Object.keys(PRICES).find((m) => u.model.startsWith(m));
  const p = PRICES[known ?? "claude-opus-5-5"];
  return Math.round(u.inputTokens * p.input + u.cacheWriteTokens * p.input * 1.25 + u.cacheReadTokens * p.cacheRead + u.outputTokens * p.output);
}

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
