import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Clock, Mic, Sparkles, X } from "lucide-react";
import { api } from "../api/client";
import { useAiAvailable } from "../lib/aiStatus";
import { useSpeechInput } from "../lib/useSpeechInput";
import { createTrip, setCurrentTripId } from "../lib/trips";
import { notifySavesChanged } from "../lib/savesChanged";
import { showToast } from "../lib/toast";
import type { TravelerTag } from "../types";

interface ComposedStop {
  id: string;
  stayMinutes: number;
  day: number;
  reason: string | null;
  matched: { category: boolean; tags: TravelerTag[]; text: boolean; season: boolean } | null;
  reel: {
    id: string;
    videoUrl: string;
    category: string;
    locationName: string | null;
    municipality: { name: string; prefecture: string };
  };
}

interface Composed {
  mode: "ai" | "keyword";
  name: string;
  summary: string | null;
  requestedDays: number;
  stops: ComposedStop[];
}

const EXAMPLES = ["example1", "example2", "example3"] as const;

// "AIで旅をつくる": describe a whole trip ("2泊3日で長野、温泉とお城") and get
// a ready しおり from Jaziba's posts — split into days, with stay times — to
// look over, trim, rename and then create. Says plainly when it was built by
// keyword matching instead of AI.
export default function TripComposerSheet({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ai = useAiAvailable();
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Composed | null>(null);
  const [name, setName] = useState("");
  const [building, setBuilding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeechInput(i18n.language, (text, final) => {
    setMessage(text);
    if (final) void build(text);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function build(text = message) {
    if (!text.trim() || building) return;
    setBuilding(true);
    setError(null);
    try {
      const { data } = await api.post<Composed>("/me/trips/compose", { message: text, lang: i18n.language });
      setDraft(data);
      setName(data.name);
    } catch {
      setError(t("composer.error"));
    } finally {
      setBuilding(false);
    }
  }

  // Taking a stop out re-counts the days the way the しおり will: a place to
  // stay that isn't last ends a day.
  function remove(id: string) {
    setDraft((d) => {
      if (!d) return d;
      let day = 1;
      const stops = d.stops
        .filter((s) => s.id !== id)
        .map((s, i, all) => {
          const out = { ...s, day };
          if (s.reel.category === "lodging" && i < all.length - 1) day += 1;
          return out;
        });
      return { ...d, stops };
    });
  }

  async function create() {
    if (!draft || draft.stops.length === 0 || !name.trim()) return;
    setCreating(true);
    try {
      const trip = await createTrip(
        name.trim().slice(0, 40),
        null,
        draft.stops.map((s) => ({ reelId: s.id, stayMinutes: s.stayMinutes }))
      );
      notifySavesChanged();
      setCurrentTripId(trip.id);
      showToast(t("composer.created"));
      onClose();
      navigate(`/itinerary/${trip.id}`);
    } catch {
      setError(t("composer.error"));
      setCreating(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void build();
  }

  const days = draft ? [...new Set(draft.stops.map((s) => s.day))] : [];
  const shownDays = days.length;

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[65] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("composer.title")}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-in flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white md:rounded-[28px]"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <span className="ai-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="flex-1 text-[15px] font-bold text-jz-ink">{t("composer.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("reelViewer.closeLabel")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {building ? (
            <div aria-live="polite">
              <p className="flex items-center gap-2 text-sm font-semibold text-jz-ink">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="h-1.5 w-1.5 animate-bounce rounded-full bg-jz-red" style={{ animationDelay: `${k * 0.15}s` }} />
                ))}
                <span className="ml-1">{t("composer.building")}</span>
              </p>
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="skeleton h-16 w-12 shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="skeleton h-3.5 w-2/3 rounded-full" />
                      <div className="skeleton h-3 w-1/3 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !draft ? (
            <>
              <p className="text-sm leading-relaxed text-gray-600">{t("composer.intro")}</p>
              <form onSubmit={submit} className="mt-4">
                <label className="block text-xs font-semibold text-gray-500" htmlFor="composer-message">
                  {t("composer.label")}
                </label>
                <div className="mt-1.5 flex items-start gap-2">
                  <textarea
                    id="composer-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={300}
                    rows={3}
                    placeholder={speech.listening ? t("concierge.listening") : t("composer.placeholder")}
                    className="min-w-0 flex-1 resize-none rounded-2xl bg-gray-100 px-4 py-3 text-sm text-jz-ink outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-jz-red/30"
                  />
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
                </div>
              </form>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {EXAMPLES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMessage(t(`composer.${key}`))}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-jz-ink hover:bg-gray-50 active:scale-95"
                  >
                    {t(`composer.${key}`)}
                  </button>
                ))}
              </div>
              {ai === false && <p className="mt-4 rounded-2xl bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-500">{t("composer.keywordNote")}</p>}
            </>
          ) : draft.stops.length === 0 ? (
            <p className="text-sm leading-relaxed text-gray-600">{draft.summary ?? t("composer.noMatch")}</p>
          ) : (
            <>
              <p className="text-[11px] font-semibold text-gray-500">{draft.mode === "ai" ? t("composer.byAi") : t("composer.byKeyword")}</p>
              <label className="mt-3 block text-xs font-semibold text-gray-500" htmlFor="composer-name">
                {t("tripPicker.nameLabel")}
              </label>
              <input
                id="composer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                className="mt-1.5 w-full rounded-2xl bg-gray-100 px-4 py-2.5 text-sm font-bold text-jz-ink outline-none focus:ring-2 focus:ring-jz-red/30"
              />
              {draft.summary && <p className="mt-3 text-sm leading-relaxed text-jz-ink">{draft.summary}</p>}
              {draft.requestedDays > shownDays && (
                <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
                  {t("composer.fewerDays", { requested: draft.requestedDays, count: shownDays })}
                </p>
              )}
              {days.map((day) => (
                <section key={day} className="mt-5">
                  {shownDays > 1 && <h3 className="mb-2 text-xs font-extrabold text-jz-red">{t("itinerary.dayLabel", { day })}</h3>}
                  <ol className="space-y-2.5">
                    {draft.stops
                      .filter((s) => s.day === day)
                      .map((s, i) => (
                        <ComposedStopRow key={s.id} stop={s} index={i} onRemove={() => remove(s.id)} />
                      ))}
                  </ol>
                </section>
              ))}
              <p className="mt-4 text-[11px] leading-relaxed text-gray-500">{t("composer.afterNote")}</p>
            </>
          )}
          {error && <p className="mt-4 text-xs text-jz-red">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {!draft ? (
            <button
              type="button"
              onClick={() => void build()}
              disabled={!message.trim() || building}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-jz-red py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" /> {t("composer.build")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-semibold text-jz-ink active:scale-[0.98]"
              >
                {t("composer.redo")}
              </button>
              {draft.stops.length > 0 && (
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={creating || !name.trim()}
                  className="flex-[2] rounded-full bg-jz-red py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60"
                >
                  {t("composer.create", { count: draft.stops.length })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ComposedStopRow({ stop, index, onRemove }: { stop: ComposedStop; index: number; onRemove: () => void }) {
  const { t } = useTranslation();
  const { reel } = stop;
  const place = reel.locationName || reel.municipality.name;
  const why =
    stop.reason ??
    [
      stop.matched?.category ? t("concierge.matchCategory", { category: t(`category.${reel.category}`) }) : null,
      ...(stop.matched?.tags ?? []).map((tag) => t(`travelerTag.${tag}`)),
      stop.matched?.text ? t("concierge.matchPlace") : null,
      stop.matched?.season ? t("concierge.matchSeason") : null,
    ]
      .filter(Boolean)
      .join("・");
  return (
    <li className="animate-page-in flex gap-3" style={{ animationDelay: `${index * 70}ms`, animationFillMode: "both" }}>
      <span className="on-media relative h-16 w-12 shrink-0 overflow-hidden rounded-xl bg-gray-100">
        <video src={`${reel.videoUrl}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-jz-ink">{place}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
          {reel.municipality.name}・{t(`category.${reel.category}`)}
          {reel.category !== "lodging" && (
            <>
              <Clock className="ml-1 h-3 w-3" /> {t("tripPlan.stay", { minutes: stop.stayMinutes })}
            </>
          )}
        </p>
        {why && <p className="mt-1 text-xs leading-relaxed text-gray-600">{why}</p>}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("composer.removeStop", { place })}
        className="self-start rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-jz-red"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}
