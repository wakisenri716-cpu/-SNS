import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Share2, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { shareOrDownload } from "../lib/stampCard";
import { renderRecapCard, personaOf, type Recap } from "../lib/recap";
import { showToast } from "../lib/toast";

const SLIDE_MS = 6000;

// 旅の振り返り: the traveler's year as full-screen story slides — tap the
// right side for the next, left for the previous, hold to pause — ending
// with a summary that can be shared as an image.
export default function RecapPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sharing, setSharing] = useState(false);
  const year = params.get("year");

  useEffect(() => {
    if (!user) return;
    api
      .get<Recap>("/me/recap", { params: year ? { year } : {} })
      .then(({ data }) => setRecap(data))
      .catch(() => setFailed(true));
  }, [user, year]);

  const slides = recap ? buildSlides(recap) : [];
  const last = slides.length - 1;

  // Auto-advance (not past the summary, not while held).
  useEffect(() => {
    if (!recap || paused || index >= last) return;
    const timer = window.setTimeout(() => setIndex((i) => Math.min(last, i + 1)), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [recap, index, paused, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(last, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, navigate]);

  if (!user) {
    return (
      <div className="mx-auto max-w-lg p-6 text-sm text-gray-500">
        <Link to="/login" state={{ from: "/recap" }} className="font-semibold text-gray-900 hover:underline">
          {t("itinerary.loginCta")}
        </Link>
      </div>
    );
  }

  async function share() {
    if (!recap) return;
    setSharing(true);
    try {
      const blob = await renderRecapCard(recap, {
        title: t("recap.cardTitle", { year: recap.year }),
        persona: t(`recap.persona.${personaOf(recap)}`),
        saved: t("recap.cardSaved"),
        prefectures: t("recap.cardPrefectures"),
        stamps: t("recap.cardStamps"),
        likes: t("recap.cardLikes"),
        topTown: recap.topMunicipality ? t("recap.cardTopTown", { town: recap.topMunicipality.name }) : "",
        footer: t("recap.cardFooter"),
      });
      const result = await shareOrDownload(blob, `jaziba-${recap.year}.png`, t("recap.cardTitle", { year: recap.year }));
      if (result === "downloaded") showToast(t("recap.saved"));
    } catch {
      showToast(t("recap.shareError"));
    } finally {
      setSharing(false);
    }
  }

  const slide = slides[index];
  return (
    <div className="on-media fixed inset-0 z-[70] overflow-hidden bg-black text-white">
      <div className={`absolute inset-0 transition-[background] duration-700 ${slide?.bg ?? "bg-gradient-to-b from-slate-900 to-slate-800"}`} />
      {recap && (
        <>
          {/* Progress bars, one per slide. */}
          <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            {slides.map((s, i) => (
              <span key={s.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <span
                  key={`${i}-${index}`}
                  className="block h-full bg-white"
                  style={
                    i < index || (i === index && i === last)
                      ? { width: "100%" }
                      : i === index
                        ? { width: "100%", animation: `recap-progress ${SLIDE_MS}ms linear`, animationPlayState: paused ? "paused" : "running" }
                        : { width: 0 }
                  }
                />
              </span>
            ))}
          </div>
          {/* Tap zones: left back, right forward; holding pauses. */}
          {index < last && (
            <div className="absolute inset-0 z-10 flex">
              <button
                type="button"
                aria-label={t("recap.previous")}
                className="h-full w-1/3"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                onPointerDown={() => setPaused(true)}
                onPointerUp={() => setPaused(false)}
                onPointerLeave={() => setPaused(false)}
              />
              <button
                type="button"
                aria-label={t("recap.next")}
                className="h-full flex-1"
                onClick={() => setIndex((i) => Math.min(last, i + 1))}
                onPointerDown={() => setPaused(true)}
                onPointerUp={() => setPaused(false)}
                onPointerLeave={() => setPaused(false)}
              />
            </div>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={t("recap.close")}
        className="absolute right-3 top-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/25"
      >
        <X className="h-5 w-5" />
      </button>

      <div key={slide?.key ?? "loading"} className="animate-page-in relative z-0 flex h-full flex-col justify-center px-7 pb-16 pt-20" aria-live="polite">
        {failed ? (
          <p className="text-center text-sm">{t("recap.error")}</p>
        ) : !recap ? (
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" aria-label={t("recap.loading")} />
        ) : (
          slide.body(t)
        )}
        {recap && index === last && (
          <div className="relative z-20 mt-8 flex flex-col items-center gap-2">
            {isEmpty(recap) ? (
              <Link to="/" className="rounded-full bg-white px-6 py-3 text-sm font-bold text-jz-ink">
                {t("recap.findPlaces")}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void share()}
                disabled={sharing}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-jz-ink active:scale-95 disabled:opacity-60"
              >
                <Share2 className="h-4 w-4" /> {t("recap.share")}
              </button>
            )}
            {slides.length > 1 && (
              <button type="button" onClick={() => setIndex(0)} className="px-4 py-2 text-xs font-semibold text-white/80">
                {t("recap.replay")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function isEmpty(r: Recap) {
  return r.saved.count + r.stamps.count + r.likes === 0;
}

type T = (key: string, opts?: Record<string, unknown>) => string;
interface Slide {
  key: string;
  bg: string;
  body: (t: T) => ReactNode;
}

function buildSlides(r: Recap): Slide[] {
  if (isEmpty(r)) {
    return [
      {
        key: "empty",
        bg: "bg-gradient-to-b from-slate-900 to-slate-700",
        body: (t) => (
          <div className="text-center">
            <p className="text-6xl font-black tabular-nums">{r.year}</p>
            <p className="mt-4 text-lg font-bold">{t("recap.emptyTitle")}</p>
            <p className="mt-2 text-sm text-white/75">{t("recap.emptyBody")}</p>
          </div>
        ),
      },
    ];
  }
  const persona = personaOf(r);
  const slides: Slide[] = [
    {
      key: "intro",
      bg: "bg-gradient-to-br from-[#d7202e] via-[#ff7a4d] to-[#ff4f8b]",
      body: (t) => (
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/80">Jaziba</p>
          <p className="mt-2 text-7xl font-black tabular-nums">{r.year}</p>
          <p className="mt-3 text-xl font-bold">{t("recap.introTitle")}</p>
          <p className="mt-10 text-sm text-white/80">{t("recap.personaLead")}</p>
          <p className="mt-1 text-3xl font-black">{t(`recap.persona.${persona}`)}</p>
          <p className="mt-2 text-sm text-white/85">{t(`recap.personaWhy.${persona}`)}</p>
        </div>
      ),
    },
    {
      key: "saved",
      bg: "bg-gradient-to-br from-sky-700 via-sky-600 to-indigo-700",
      body: (t) => (
        <div>
          <p className="text-sm font-semibold text-white/80">{t("recap.savedLead")}</p>
          <p className="mt-1 flex items-baseline gap-2">
            <CountUp value={r.saved.count} className="text-8xl font-black" />
            <span className="text-2xl font-bold">{t("recap.places")}</span>
          </p>
          {r.saved.prefectures.length > 0 && (
            <>
              <p className="mt-6 text-sm font-semibold text-white/80">{t("recap.prefecturesLead", { count: r.saved.prefectures.length })}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.saved.prefectures.map((p, i) => (
                  <span key={p} className="animate-page-in rounded-full bg-white/20 px-3 py-1 text-sm font-bold" style={{ animationDelay: `${300 + i * 90}ms`, animationFillMode: "both" }}>
                    {p}
                  </span>
                ))}
              </div>
            </>
          )}
          <Thumbs places={r.saved.places} />
          {r.saved.first && <p className="mt-4 text-xs text-white/75">{t("recap.firstSave", { place: r.saved.first.name, date: monthDay(r.saved.first.at) })}</p>}
        </div>
      ),
    },
    {
      key: "stamps",
      bg: "bg-gradient-to-br from-emerald-700 via-teal-700 to-emerald-900",
      body: (t) =>
        r.stamps.count > 0 ? (
          <div>
            <p className="text-sm font-semibold text-white/80">{t("recap.stampsLead")}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <CountUp value={r.stamps.count} className="text-8xl font-black" />
              <span className="text-2xl font-bold">{t("recap.stampsUnit")}</span>
            </p>
            <ul className="mt-6 space-y-2">
              {r.stamps.places.map((p, i) => (
                <li key={p.id} className="animate-page-in flex items-center gap-3" style={{ animationDelay: `${300 + i * 120}ms`, animationFillMode: "both" }}>
                  <span className="flex h-10 w-10 shrink-0 rotate-[-8deg] items-center justify-center rounded-full border-2 border-white text-[9px] font-black">JAZIBA</span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{p.name}</span>
                    <span className="block text-xs text-white/75">
                      {p.prefecture}・{monthDay(p.at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <p className="text-2xl font-black">{t("recap.noStampsTitle")}</p>
            <p className="mt-2 text-sm text-white/80">{t("recap.noStampsBody")}</p>
          </div>
        ),
    },
  ];
  if (r.topMunicipality || r.topCategory) {
    slides.push({
      key: "favourite",
      bg: "bg-gradient-to-br from-fuchsia-700 via-purple-700 to-indigo-800",
      body: (t) => (
        <div>
          {r.topMunicipality && (
            <>
              <p className="text-sm font-semibold text-white/80">{t("recap.topTownLead")}</p>
              <p className="mt-2 text-5xl font-black">{r.topMunicipality.name}</p>
              <p className="mt-1 text-sm text-white/80">
                {r.topMunicipality.prefecture}・{t("recap.topTownCount", { count: r.topMunicipality.count })}
              </p>
            </>
          )}
          {r.topCategory && (
            <>
              <p className="mt-10 text-sm font-semibold text-white/80">{t("recap.topCategoryLead")}</p>
              <p className="mt-1 text-3xl font-black">{t(`category.${r.topCategory.category}`)}</p>
            </>
          )}
        </div>
      ),
    });
  }
  if (r.busiestMonth) {
    const max = Math.max(...r.months, 1);
    slides.push({
      key: "months",
      bg: "bg-gradient-to-br from-amber-600 via-orange-600 to-rose-700",
      body: (t) => (
        <div>
          <p className="text-sm font-semibold text-white/80">{t("recap.busiestLead")}</p>
          <p className="mt-1 text-5xl font-black">{t("recap.month", { month: r.busiestMonth })}</p>
          <div className="mt-8 flex h-40 items-end gap-1.5" role="img" aria-label={t("recap.monthsChart")}>
            {r.months.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={`w-full origin-bottom rounded-t-md ${i + 1 === r.busiestMonth ? "bg-white" : "bg-white/40"}`}
                  style={{ height: `${(n / max) * 100}%`, minHeight: n > 0 ? 4 : 1, animation: `recap-grow 700ms ${i * 50}ms both cubic-bezier(.2,.8,.2,1)` }}
                />
                <span className="text-[10px] text-white/75">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    });
  }
  slides.push({
    key: "summary",
    bg: "bg-gradient-to-b from-slate-900 via-slate-800 to-[#3a0d12]",
    body: (t) => (
      <div className="text-center">
        <p className="text-sm font-semibold text-white/70">{t("recap.cardTitle", { year: r.year })}</p>
        <p className="mt-2 text-3xl font-black">{t(`recap.persona.${persona}`)}</p>
        <dl className="mx-auto mt-8 grid max-w-xs grid-cols-2 gap-3">
          {[
            [r.saved.count, t("recap.cardSaved")],
            [r.saved.prefectures.length, t("recap.cardPrefectures")],
            [r.stamps.count, t("recap.cardStamps")],
            [r.likes, t("recap.cardLikes")],
          ].map(([n, label]) => (
            <div key={String(label)} className="rounded-2xl bg-white/10 px-3 py-3">
              <dd className="text-3xl font-black tabular-nums">{n}</dd>
              <dt className="text-[11px] text-white/70">{label}</dt>
            </div>
          ))}
        </dl>
        {r.topMunicipality && <p className="mt-5 text-sm text-white/80">{t("recap.cardTopTown", { town: r.topMunicipality.name })}</p>}
      </div>
    ),
  });
  return slides;
}

function Thumbs({ places }: { places: Recap["saved"]["places"] }) {
  if (places.length === 0) return null;
  return (
    <div className="mt-6 flex -space-x-3">
      {places.map((p, i) => (
        <span
          key={p.id}
          className="animate-page-in h-16 w-12 overflow-hidden rounded-xl border-2 border-white/80 bg-white/10 shadow-lg"
          style={{ animationDelay: `${500 + i * 80}ms`, animationFillMode: "both", transform: `rotate(${(i % 2 ? 1 : -1) * (3 + i)}deg)` }}
        >
          {p.thumbnailUrl ? (
            <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <video src={`${p.videoUrl}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          )}
        </span>
      ))}
    </div>
  );
}

// Counts up from 0 when the slide appears (instant with reduced motion).
function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const frame = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1200);
      setShown(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);
  return <span className={`tabular-nums ${className ?? ""}`}>{shown}</span>;
}

function monthDay(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
