import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Sparkles, X } from "lucide-react";
import { api } from "../api/client";
import { showToast } from "../lib/toast";
import type { ItineraryStop } from "../types";

interface Plan {
  mode: "ai" | "auto";
  summary: string | null;
  stops: { id: string; stayMinutes: number; note: string | null }[];
}

const WISHES = ["wishRelaxed", "wishEfficient", "wishFoodie"] as const;

// "AIでプランを作る": asks for a proposed order + stay times for the しおり,
// shows it, and applies it only if the traveler accepts.
export default function TripPlanSheet({
  stops,
  onClose,
  onApplied,
}: {
  stops: ItineraryStop[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [wishes, setWishes] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(stops.map((s) => [s.id, s]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function makePlan() {
    setPlanning(true);
    setError(null);
    try {
      const { data } = await api.post<Plan>("/reels/itinerary/plan", { wishes, lang: i18n.language });
      setPlan(data);
    } catch {
      setError(t("tripPlan.error"));
    } finally {
      setPlanning(false);
    }
  }

  async function apply() {
    if (!plan) return;
    setApplying(true);
    try {
      await api.put("/reels/itinerary/order", { reelIds: plan.stops.map((s) => s.id) });
      await Promise.all(
        plan.stops
          .filter((s) => byId.get(s.id)?.stayMinutes !== s.stayMinutes)
          .map((s) => api.patch(`/reels/${s.id}/save`, { stayMinutes: s.stayMinutes }))
      );
      showToast(t("tripPlan.applied"));
      onApplied();
      onClose();
    } catch {
      setError(t("tripPlan.error"));
      setApplying(false);
    }
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-[65] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("tripPlan.title")}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-in flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white md:rounded-[28px]"
      >
        <header className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <span className="ai-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="flex-1 text-[15px] font-bold text-jz-ink">{t("tripPlan.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("reelViewer.closeLabel")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!plan ? (
            <>
              <p className="text-sm leading-relaxed text-gray-600">{t("tripPlan.intro", { count: stops.length })}</p>
              <label className="mt-4 block text-xs font-semibold text-gray-500" htmlFor="trip-wishes">
                {t("tripPlan.wishesLabel")}
              </label>
              <input
                id="trip-wishes"
                value={wishes}
                onChange={(e) => setWishes(e.target.value)}
                maxLength={300}
                placeholder={t("tripPlan.wishesPlaceholder")}
                className="mt-1.5 w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm text-jz-ink outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-jz-red/30"
              />
              <div className="mt-2.5 flex flex-wrap gap-2">
                {WISHES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setWishes(t(`tripPlan.${key}`))}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-jz-ink hover:bg-gray-50 active:scale-95"
                  >
                    {t(`tripPlan.${key}`)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold text-gray-400">{plan.mode === "ai" ? t("tripPlan.byAi") : t("tripPlan.byAuto")}</p>
              {plan.summary && <p className="mt-2 text-sm leading-relaxed text-jz-ink">{plan.summary}</p>}
              <ol className="mt-4 space-y-3">
                {plan.stops.map((s, i) => {
                  const stop = byId.get(s.id);
                  return (
                    <li key={s.id} className="animate-page-in flex gap-3" style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-jz-red text-xs font-bold text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1 rounded-2xl bg-gray-50 p-3">
                        <p className="truncate text-sm font-bold text-jz-ink">{stop?.locationName || stop?.municipality.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" /> {t("tripPlan.stay", { minutes: s.stayMinutes })}
                        </p>
                        {s.note && <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{s.note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          {error && <p className="mt-4 text-xs text-jz-red">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {!plan ? (
            <button
              type="button"
              onClick={() => void makePlan()}
              disabled={planning}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-jz-red py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60"
            >
              {planning ? (
                <>
                  {[0, 1, 2].map((k) => (
                    <span key={k} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: `${k * 0.15}s` }} />
                  ))}
                  <span className="ml-1">{t("tripPlan.planning")}</span>
                </>
              ) : (
                t("tripPlan.make")
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPlan(null)}
                className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-semibold text-jz-ink active:scale-[0.98]"
              >
                {t("tripPlan.redo")}
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={applying}
                className="flex-[2] rounded-full bg-jz-red py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60"
              >
                {t("tripPlan.apply")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
