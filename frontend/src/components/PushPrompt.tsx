import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, X } from "lucide-react";
import { enablePush, getPushState, type PushState } from "../lib/push";
import { showToast } from "../lib/toast";

const DISMISSED_KEY = "jaziba-push-prompt-dismissed";

// On お知らせ: a one-tap way to also get these as push notifications, shown
// only where push works and isn't on yet, until turned on or dismissed.
export default function PushPrompt() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  if (dismissed || state !== "off") return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Shown again next time; harmless.
    }
  }

  async function turnOn() {
    try {
      const next = await enablePush(i18n.language);
      setState(next);
      if (next === "on") showToast(t("push.enabledToast"));
    } catch {
      showToast(t("push.error"));
    }
  }

  return (
    <div className="animate-page-in mt-4 flex items-center gap-3 rounded-2xl bg-jz-tint px-4 py-3">
      <BellRing className="h-5 w-5 shrink-0 text-jz-red" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-jz-ink">{t("push.prompt")}</p>
      <button type="button" onClick={() => void turnOn()} className="shrink-0 rounded-full bg-jz-red px-3 py-1.5 text-xs font-bold text-white active:scale-95">
        {t("push.turnOn")}
      </button>
      <button type="button" onClick={dismiss} aria-label={t("push.dismiss")} className="shrink-0 rounded-full p-1 text-gray-500 hover:bg-white/60">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
