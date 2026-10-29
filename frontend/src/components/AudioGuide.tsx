import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Headphones, Square } from "lucide-react";
import { api } from "../api/client";
import { useAiAvailable } from "../lib/aiStatus";
import { formatBestMonths } from "../lib/season";
import type { Reel } from "../types";

const VOICE_LANG: Record<string, string> = { ja: "ja-JP", en: "en-US", zh: "zh-CN", ko: "ko-KR" };

// 音声ガイド: the device reads the spot aloud — name, town, 見頃 and the
// poster's caption — so travelers can listen on the way instead of reading.
// Uses the browser's own speech synthesis (nothing is sent anywhere for the
// voice). In another UI language the caption is read in Claude's translation
// when available; otherwise the original Japanese is read in a Japanese
// voice, and the button says so.
export default function AudioGuide({ reel }: { reel: Reel }) {
  const { t, i18n } = useTranslation();
  const aiAvailable = useAiAvailable();
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const alive = useRef(true);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const lang = i18n.language;
  const readsJapanese = lang !== "ja" && aiAvailable === false;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported, reel.id]);

  if (!supported || !reel.caption.trim()) return null;

  async function start() {
    let caption = reel.caption;
    let voiceLang = lang;
    if (lang !== "ja") {
      if (aiAvailable) {
        setPreparing(true);
        try {
          caption = (await api.post<{ caption: string }>(`/reels/${reel.id}/translation`, { lang })).data.caption;
        } catch {
          voiceLang = "ja";
        } finally {
          setPreparing(false);
        }
      } else {
        voiceLang = "ja";
      }
    }
    if (!alive.current) return;
    const place = reel.locationName || reel.municipality.name;
    const parts =
      voiceLang === lang
        ? [
            t("audioGuide.intro", { place, town: `${reel.municipality.prefecture}${reel.municipality.name}` }),
            reel.bestMonths?.length ? t("audioGuide.season", { months: formatBestMonths(reel.bestMonths, lang, "long") }) : "",
            caption,
          ]
        : [`${place}。`, caption];
    const utterance = new SpeechSynthesisUtterance(parts.filter(Boolean).join(" "));
    utterance.lang = VOICE_LANG[voiceLang] ?? "ja-JP";
    utterance.rate = 1;
    utterance.onend = () => alive.current && setSpeaking(false);
    utterance.onerror = () => alive.current && setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  return (
    <button
      type="button"
      onClick={() => (speaking ? stop() : void start())}
      disabled={preparing}
      aria-pressed={speaking}
      className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:bg-gray-50 active:scale-[0.99] disabled:opacity-60"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${speaking ? "bg-jz-red" : "bg-jz-ink"}`}>
        {speaking ? <Square className="h-4 w-4 fill-white" /> : <Headphones className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-jz-ink">
          {preparing ? t("audioGuide.preparing") : speaking ? t("audioGuide.stop") : t("audioGuide.start")}
        </span>
        <span className="block text-[11px] text-gray-500">{readsJapanese ? t("audioGuide.japaneseOnly") : t("audioGuide.hint")}</span>
      </span>
      {speaking && (
        <span className="flex h-5 items-end gap-0.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="audio-bar w-1 rounded-full bg-jz-red" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </span>
      )}
    </button>
  );
}
