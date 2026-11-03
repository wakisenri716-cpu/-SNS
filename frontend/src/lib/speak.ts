// Reading text aloud with the browser's voices (speechSynthesis): for the AI
// concierge's 会話モード. Nothing leaves the device. Long text is spoken a
// sentence at a time, since some browsers stop a long utterance part way.
const LOCALES: Record<string, string> = { ja: "ja-JP", en: "en-US", zh: "zh-CN", ko: "ko-KR" };

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** Sentences short enough to speak one at a time. */
export function sentences(text: string): string[] {
  return (text.match(/[^。！？!?.\n]+[。！？!?.]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

let run = 0;

/** Speak the text; resolves when done, or when stopSpeaking() cuts it short. */
export function speak(text: string, lang: string): Promise<void> {
  if (!canSpeak()) return Promise.resolve();
  const mine = ++run;
  window.speechSynthesis.cancel();
  const locale = LOCALES[lang] ?? "ja-JP";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === locale) ?? null;
  return sentences(text).reduce<Promise<void>>(
    (prev, part) =>
      prev.then(
        () =>
          new Promise<void>((resolve) => {
            if (mine !== run) return resolve();
            const u = new SpeechSynthesisUtterance(part);
            u.lang = locale;
            if (voice) u.voice = voice;
            u.rate = 1.05;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            window.speechSynthesis.speak(u);
          })
      ),
    Promise.resolve()
  );
}

export function stopSpeaking() {
  run++;
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Whether speak() for this call is still the latest (not stopped or replaced). */
export const speakingRun = () => run;
