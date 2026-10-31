// 端末内のAIで要約: the browser's built-in summarization model (Chrome's
// Summarizer API, Gemini Nano). The text never leaves the device and no
// server key is needed; the first use may download the model once. It writes
// in Japanese, English or Spanish — for other UI languages the summary is
// written in English and then translated on the device when possible.
import { translateOnDevice } from "./onDeviceTranslate";
export { commentsForSummary } from "./summaryInput";

type Availability = "unavailable" | "downloadable" | "downloading" | "available";
interface SummarizerLike {
  summarize(text: string, opts?: { context?: string }): Promise<string>;
}
interface SummarizerStatic {
  availability(opts?: Record<string, unknown>): Promise<Availability>;
  create(opts: Record<string, unknown> & { monitor?: (m: EventTarget) => void }): Promise<SummarizerLike>;
}

const summarizerApi = () => (globalThis as unknown as { Summarizer?: SummarizerStatic }).Summarizer;

export function onDeviceSummarySupported() {
  return !!summarizerApi();
}

const WRITES = ["ja", "en", "es"];
export type SummaryResult = { kind: "summary"; text: string } | { kind: "unavailable" };

export async function summarizeOnDevice(
  text: string,
  uiLanguage: string,
  { context, onProgress }: { context?: string; onProgress?: (fraction: number) => void } = {}
): Promise<SummaryResult> {
  const Summarizer = summarizerApi();
  if (!Summarizer) return { kind: "unavailable" };
  const lang = uiLanguage.split("-")[0];
  const outputLanguage = WRITES.includes(lang) ? lang : "en";
  const options = { type: "key-points", format: "plain-text", length: "short", expectedInputLanguages: ["ja", "en"], outputLanguage };
  if ((await Summarizer.availability(options)) === "unavailable") return { kind: "unavailable" };
  const summarizer = await Summarizer.create({
    ...options,
    sharedContext: context,
    monitor: (m) => m.addEventListener("downloadprogress", (e) => onProgress?.((e as ProgressEvent).loaded / ((e as ProgressEvent).total || 1))),
  });
  let summary = (await summarizer.summarize(text, { context })).trim();
  if (outputLanguage !== lang) {
    const translated = await translateOnDevice(summary, lang, { source: outputLanguage }).catch(() => null);
    if (translated?.kind === "translated") summary = translated.text;
  }
  return summary ? { kind: "summary", text: summary } : { kind: "unavailable" };
}
