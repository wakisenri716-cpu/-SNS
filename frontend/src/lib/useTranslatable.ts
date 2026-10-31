import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiAvailable } from "./aiStatus";
import { onDeviceTranslationSupported, translateOnDevice } from "./onDeviceTranslate";

// "翻訳を見る" for a caption or comment, into the UI language. With Claude
// configured the server translates (and caches); otherwise the browser's
// built-in AI translates on the device, where supported. `by` says which,
// so the UI can credit it honestly.
export function useTranslatable(
  text: string,
  { source, fromServer }: { source?: string; fromServer: (lang: string) => Promise<string> }
) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const ai = useAiAvailable();
  const onDevice = !ai && onDeviceTranslationSupported();
  const [done, setDone] = useState<Record<string, { text: string; by: "claude" | "device" }>>({});
  const [showing, setShowing] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "failed" | "same" | "unsupported">("idle");
  const [progress, setProgress] = useState<number | null>(null);

  const available = text.trim().length > 0 && (source ? source !== lang : true) && (!!ai || onDevice);
  const result = done[lang];

  async function toggle() {
    if (showing) return setShowing(false);
    if (result) return setShowing(true);
    setStatus("loading");
    try {
      if (ai) {
        const translated = await fromServer(lang);
        setDone((prev) => ({ ...prev, [lang]: { text: translated, by: "claude" } }));
      } else {
        const out = await translateOnDevice(text, lang, { source, onProgress: setProgress });
        setProgress(null);
        if (out.kind === "same") return setStatus("same");
        if (out.kind === "unavailable") return setStatus("unsupported");
        setDone((prev) => ({ ...prev, [lang]: { text: out.text, by: "device" } }));
      }
      setShowing(true);
      setStatus("idle");
    } catch {
      setProgress(null);
      setStatus("failed");
    }
  }

  return {
    available,
    showing: showing && !!result?.text,
    text: showing && result?.text ? result.text : text,
    by: result?.by ?? (ai ? "claude" : "device"),
    status,
    progress,
    toggle,
  };
}
