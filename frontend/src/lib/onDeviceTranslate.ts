// 端末内のAIで翻訳: the browser's built-in translation model (Chrome's
// Translator and Language Detector APIs). The text never leaves the device;
// the first use of a language pair may download the model once. Used when
// the server has no Claude key — see useTranslatable.

type Availability = "unavailable" | "downloadable" | "downloading" | "available";

interface TranslatorLike {
  translate(text: string): Promise<string>;
}
interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(opts: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<TranslatorLike>;
}
interface DetectorStatic {
  availability(): Promise<Availability>;
  create(): Promise<{ detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> }>;
}

function api() {
  const g = globalThis as unknown as { Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic };
  return { Translator: g.Translator, LanguageDetector: g.LanguageDetector };
}

export function onDeviceTranslationSupported() {
  return !!api().Translator;
}

// The app's language codes are already the BCP 47 ones the API uses.
const translators = new Map<string, Promise<TranslatorLike>>();

/** Base language of a detected tag ("zh-Hant" → "zh"). */
const base = (tag: string) => tag.split("-")[0].toLowerCase();

export type OnDeviceResult = { kind: "translated"; text: string } | { kind: "same" } | { kind: "unavailable" };

// Translates into `target`. `source` is the text's language when known
// (captions are Japanese); otherwise it's detected on the device.
// `onProgress` reports a first-time model download (0–1).
export async function translateOnDevice(
  text: string,
  target: string,
  { source, onProgress }: { source?: string; onProgress?: (fraction: number) => void } = {}
): Promise<OnDeviceResult> {
  const { Translator, LanguageDetector } = api();
  if (!Translator) return { kind: "unavailable" };

  let from = source;
  if (!from) {
    if (!LanguageDetector || (await LanguageDetector.availability()) === "unavailable") return { kind: "unavailable" };
    const [best] = await (await LanguageDetector.create()).detect(text);
    if (!best || best.confidence < 0.5) return { kind: "unavailable" };
    from = base(best.detectedLanguage);
  }
  if (base(from) === base(target)) return { kind: "same" };

  const pair = { sourceLanguage: from, targetLanguage: target };
  if ((await Translator.availability(pair)) === "unavailable") return { kind: "unavailable" };
  const key = `${from}>${target}`;
  let translator = translators.get(key);
  if (!translator) {
    translator = Translator.create({
      ...pair,
      monitor: (m) =>
        m.addEventListener("downloadprogress", (e) => onProgress?.((e as ProgressEvent).loaded / ((e as ProgressEvent).total || 1))),
    });
    translators.set(key, translator);
    translator.catch(() => translators.delete(key));
  }
  return { kind: "translated", text: await (await translator).translate(text) };
}
