import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUp, Bookmark, Camera, Mic, Navigation, RotateCcw, Sparkles, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { showToast } from "../lib/toast";
import { useSpeechInput } from "../lib/useSpeechInput";
import { resizeImageToDataUrl } from "../lib/resizeImage";
import { chooseTrips } from "../lib/trips";
import type { Reel, TravelerTag } from "../types";

interface Pick {
  reel: Reel;
  reason: string | null;
  matched: { category: boolean; tags: TravelerTag[]; text: boolean; season?: boolean } | null;
}

interface Turn {
  id: number;
  question: string;
  // 写真で探す: the (resized) photo sent instead of words.
  image?: string;
  mode?: "ai" | "keyword";
  reply?: string;
  picks?: Pick[];
  error?: boolean;
}

const SUGGESTIONS = ["suggestFamilySnow", "suggestCoupleFood", "suggestCastle", "suggestStay"] as const;

// Reveals text a few characters at a time, like it's being written.
function Typewriter({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const timer = setInterval(() => setShown((n) => (n >= text.length ? n : n + 2)), 18);
    return () => clearInterval(timer);
  }, [text]);
  return (
    <>
      {text.slice(0, shown)}
      {shown < text.length && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-full bg-jz-red align-middle" />}
    </>
  );
}

function PickCard({ pick, onSave }: { pick: Pick; onSave: (reel: Reel) => void }) {
  const { t } = useTranslation();
  const { reel } = pick;
  const reason =
    pick.reason ??
    [
      pick.matched?.category ? t("concierge.matchCategory", { category: t(`category.${reel.category}`) }) : null,
      ...(pick.matched?.tags ?? []).map((tag) => t(`travelerTag.${tag}`)),
      pick.matched?.text ? t("concierge.matchPlace") : null,
      pick.matched?.season ? t("concierge.matchSeason") : null,
    ]
      .filter(Boolean)
      .join("・");
  return (
    <div className="animate-page-in w-56 shrink-0 overflow-hidden rounded-3xl border border-gray-200 bg-white">
      <div className="on-media relative aspect-[4/5] bg-gray-100">
        <video src={`${reel.videoUrl}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-white">
          <p className="truncate text-sm font-bold">{reel.locationName || reel.municipality.name}</p>
          <p className="truncate text-[11px] text-white/75">
            {reel.municipality.name}・{reel.municipality.prefecture}
          </p>
        </div>
      </div>
      <p className="line-clamp-3 min-h-[3.75rem] px-3 pt-2.5 text-xs leading-relaxed text-gray-700">{reason}</p>
      <div className="flex gap-1.5 p-3 pt-2">
        {reel.locationLat != null && reel.locationLng != null && (
          <Link
            to={`/reels/${reel.id}/access`}
            state={{ reel }}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-jz-red py-2 text-xs font-bold text-white active:scale-95"
          >
            <Navigation className="h-3 w-3 fill-white" /> {t("feed.directions")}
          </Link>
        )}
        <button
          type="button"
          onClick={() => onSave(reel)}
          aria-pressed={reel.savedByMe}
          className={`flex flex-1 items-center justify-center gap-1 rounded-full py-2 text-xs font-bold active:scale-95 ${
            reel.savedByMe ? "bg-jz-ink text-white" : "bg-gray-100 text-jz-ink"
          }`}
        >
          <Bookmark className={`h-3 w-3 ${reel.savedByMe ? "fill-white" : ""}`} />
          {reel.savedByMe ? t("feed.savedPill") : t("feed.savePill")}
        </button>
      </div>
    </div>
  );
}

// "AIに旅を相談": describe a trip in your own words (or by voice) and get
// matching posts with why they fit, plus directions and one-tap しおり saving.
export default function ConciergeSheet({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const speech = useSpeechInput(i18n.language, (text, final) => {
    setInput(text);
    if (final) void ask(text);
  });

  useEffect(() => {
    api.get<{ ai: boolean }>("/concierge/status").then(({ data }) => setAiEnabled(data.ai)).catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const id = nextId.current++;
    // Earlier answered turns go along so follow-ups ("子連れだと？") make sense.
    const history = turns
      .filter((turn) => turn.reply != null && !turn.error && !turn.image)
      .slice(-4)
      .map((turn) => ({ question: turn.question, reply: turn.reply!, pickIds: (turn.picks ?? []).map((p) => p.reel.id) }));
    setTurns((prev) => [...prev, { id, question: q }]);
    setInput("");
    setBusy(true);
    try {
      const { data } = await api.post<{ mode: "ai" | "keyword"; reply: string | null; picks: Pick[] }>("/concierge", {
        message: q,
        lang: i18n.language,
        history,
      });
      const reply =
        data.reply ??
        (data.picks.length > 0 ? t("concierge.keywordReply", { count: data.picks.length }) : t("concierge.noMatch"));
      setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, mode: data.mode, reply, picks: data.picks } : turn)));
    } catch {
      setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, error: true, reply: t("concierge.error") } : turn)));
    } finally {
      setBusy(false);
    }
  }

  // 写真で探す: the photo is shrunk on the device, then Claude picks posts
  // with a similar feel (needs the API key; the button is hidden otherwise).
  async function askPhoto(file: File) {
    if (busy) return;
    let image: string;
    try {
      image = await resizeImageToDataUrl(file, 1024);
    } catch {
      showToast(t("concierge.photoUnreadable"));
      return;
    }
    const id = nextId.current++;
    setTurns((prev) => [...prev, { id, question: t("concierge.photoQuestion"), image }]);
    setBusy(true);
    try {
      const { data } = await api.post<{ mode: "ai" | "keyword"; reply: string | null; picks: Pick[] }>("/concierge/photo", {
        image,
        lang: i18n.language,
      });
      const reply = data.reply ?? (data.picks.length > 0 ? t("concierge.keywordReply", { count: data.picks.length }) : t("concierge.noMatch"));
      setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, mode: data.mode, reply, picks: data.picks } : turn)));
    } catch {
      setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, error: true, reply: t("concierge.photoError") } : turn)));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSave(reel: Reel) {
    if (!token) return navigate("/login");
    const saved = await chooseTrips([reel.id], reel.locationName || reel.municipality.name);
    setTurns((prev) =>
      prev.map((turn) => ({
        ...turn,
        picks: turn.picks?.map((p) => (p.reel.id === reel.id ? { ...p, reel: { ...p.reel, savedByMe: saved } } : p)),
      }))
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  // Portaled to <body> so no ancestor's stacking context (e.g. the feed
  // hero's `isolate`) can put page content above the sheet.
  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[65] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("concierge.title")}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-in flex h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white md:h-[80vh] md:rounded-[28px]"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <span className="ai-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-jz-ink">{t("concierge.title")}</h2>
            <p className="truncate text-[11px] text-gray-500">
              {aiEnabled == null ? "" : aiEnabled ? t("concierge.modeAi") : t("concierge.modeKeyword")}
            </p>
          </div>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => setTurns([])}
              disabled={busy}
              aria-label={t("concierge.newChat")}
              title={t("concierge.newChat")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            >
              <RotateCcw className="h-[18px] w-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("reelViewer.closeLabel")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
          {turns.length === 0 && (
            <div className="animate-page-in px-1">
              <p className="text-2xl font-extrabold leading-snug tracking-tight text-jz-ink">{t("concierge.greeting")}</p>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{t("concierge.intro")}</p>
              {aiEnabled && <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{t("concierge.photoHint")}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                {SUGGESTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void ask(t(`concierge.${key}`))}
                    className="rounded-full border border-gray-200 px-3.5 py-2 text-left text-[13px] text-jz-ink transition hover:bg-gray-50 active:scale-95"
                  >
                    {t(`concierge.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-3">
              <div className="flex justify-end">
                {turn.image ? (
                  <img src={turn.image} alt={turn.question} className="animate-page-in max-h-56 max-w-[70%] rounded-3xl rounded-br-lg object-cover" />
                ) : (
                  <p className="animate-page-in max-w-[80%] rounded-3xl rounded-br-lg bg-jz-ink px-4 py-2.5 text-sm text-white">{turn.question}</p>
                )}
              </div>
              {turn.reply == null ? (
                <div className="flex items-center gap-1.5 px-2 py-2" role="status" aria-label={t("concierge.thinking")}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-jz-red" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              ) : (
                <>
                  <p className={`max-w-[90%] px-1 text-sm leading-relaxed ${turn.error ? "text-jz-red" : "text-jz-ink"}`}>
                    <Typewriter text={turn.reply} />
                  </p>
                  {turn.picks && turn.picks.length > 0 && (
                    <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                      {turn.picks.map((p) => (
                        <PickCard key={p.reel.id} pick={p} onSave={toggleSave} />
                      ))}
                    </div>
                  )}
                  {turn.mode === "keyword" && <p className="px-1 text-[11px] text-gray-500">{t("concierge.keywordNote")}</p>}
                </>
              )}
            </div>
          ))}
        </div>

        {turns.length === 1 && turns[0].picks && turns[0].picks.length > 0 && !busy && (
          <p className="animate-fade-in px-5 pb-1 text-[11px] text-gray-500">{t("concierge.followUpHint")}</p>
        )}
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={300}
            placeholder={speech.listening ? t("concierge.listening") : t("concierge.placeholder")}
            className="min-w-0 flex-1 rounded-full bg-gray-100 px-4 py-3 text-sm text-jz-ink outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-jz-red/30"
          />
          {aiEnabled && (
            <label
              className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-jz-ink transition focus-within:ring-2 focus-within:ring-jz-red/30 active:scale-90 ${
                busy ? "pointer-events-none opacity-40" : ""
              }`}
              title={t("concierge.photo")}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label={t("concierge.photo")}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void askPhoto(file);
                }}
              />
              <Camera className="h-5 w-5" />
            </label>
          )}
          {speech.supported && (
            <button
              type="button"
              onClick={speech.listening ? speech.stop : speech.start}
              aria-label={speech.listening ? t("concierge.stopVoice") : t("concierge.voice")}
              aria-pressed={speech.listening}
              className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                speech.listening ? "bg-jz-red text-white" : "bg-gray-100 text-jz-ink"
              }`}
            >
              {speech.listening && <span className="absolute inset-0 animate-ping rounded-full bg-jz-red/40" />}
              <Mic className="relative h-5 w-5" />
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label={t("concierge.send")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-jz-red text-white transition active:scale-90 disabled:opacity-30"
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
