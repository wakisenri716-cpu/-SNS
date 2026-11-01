// 端末のAIで文章を整える: the browser's built-in writing model (Chrome's
// Rewriter API, Gemini Nano) rewrites a post's text — livelier, shorter or
// more polite — on the device: nothing sent, no key, no cost. The first use
// may download the model once.

type Availability = "unavailable" | "downloadable" | "downloading" | "available";
interface RewriterLike {
  rewrite(text: string, opts?: { context?: string }): Promise<string>;
}
interface RewriterStatic {
  availability(opts?: Record<string, unknown>): Promise<Availability>;
  create(opts: Record<string, unknown> & { monitor?: (m: EventTarget) => void }): Promise<RewriterLike>;
}

const rewriterApi = () => (globalThis as unknown as { Rewriter?: RewriterStatic }).Rewriter;

export function onDeviceRewriteSupported() {
  return !!rewriterApi();
}

export type RewriteStyle = "appealing" | "shorter" | "polite";

const OPTIONS: Record<RewriteStyle, { tone: string; length: string }> = {
  appealing: { tone: "more-casual", length: "as-is" },
  shorter: { tone: "as-is", length: "shorter" },
  polite: { tone: "more-formal", length: "as-is" },
};

/** Japanese text stays Japanese; anything else is rewritten in English. */
export const outputLanguageOf = (text: string) => (/[぀-ヿ㐀-鿿]/.test(text) ? "ja" : "en");

export async function rewriteOnDevice(
  text: string,
  style: RewriteStyle,
  { context, onProgress }: { context: string; onProgress?: (fraction: number) => void }
): Promise<string | null> {
  const Rewriter = rewriterApi();
  if (!Rewriter || !text.trim()) return null;
  const lang = outputLanguageOf(text);
  const options = { ...OPTIONS[style], format: "plain-text", expectedInputLanguages: [lang], outputLanguage: lang };
  if ((await Rewriter.availability(options)) === "unavailable") return null;
  const rewriter = await Rewriter.create({
    ...options,
    sharedContext: context,
    monitor: (m) => m.addEventListener("downloadprogress", (e) => onProgress?.((e as ProgressEvent).loaded / ((e as ProgressEvent).total || 1))),
  });
  const out = (await rewriter.rewrite(text, { context })).trim();
  return out || null;
}
