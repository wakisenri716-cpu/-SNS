import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BedDouble, Coffee, ExternalLink, Loader2, MapPin, Star, UtensilsCrossed } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { recordPendingBooking } from "../lib/pendingBooking";
import { showToast } from "../lib/toast";

interface Plan {
  name: string;
  roomName: string;
  totalYen: number | null;
  breakfast: boolean;
  dinner: boolean;
  reserveUrl: string;
}
interface Hotel {
  id: number;
  name: string;
  imageUrl: string | null;
  minChargeYen: number | null;
  reviewAverage: number | null;
  reviewCount: number;
  access: string;
  nearestStation: string;
  address?: string;
  planListUrl: string;
  plans: Plan[];
}
interface Result {
  configured: boolean;
  located: boolean;
  affiliate?: boolean;
  items: Hotel[];
  mapSearchUrl: string;
  nights: number;
}

const localDay = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number);
  const out = new Date(y, m - 1, d + n);
  return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, "0")}-${String(out.getDate()).padStart(2, "0")}`;
};

// 宿を探す・予約: rooms free on your dates near this spot / town, with prices,
// from 楽天トラベル. Booking and payment happen on 楽天トラベル.
export default function StaySearch({
  reelId,
  municipalityId,
  className = "",
  preview = null,
  linkedHotelNo = null,
}: {
  reelId?: string;
  municipalityId?: string;
  className?: string;
  /** Shown until the first search (the hotels around, without dates). */
  preview?: ReactNode;
  /** A lodging post's own 楽天トラベル hotel, marked in the results. */
  linkedHotelNo?: number | null;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [checkin, setCheckin] = useState(localDay(1));
  const [nights, setNights] = useState(1);
  const [adults, setAdults] = useState(2);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yen = (n: number) => `¥${n.toLocaleString(i18n.language)}`;

  async function search(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ checkin, checkout: addDays(checkin, nights), adults: String(adults) });
      if (reelId) params.set("reelId", reelId);
      if (municipalityId) params.set("municipalityId", municipalityId);
      const { data } = await api.get<Result>(`/stays?${params}`);
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("stays.error"));
      if (err?.response?.data?.mapSearchUrl) setResult({ configured: true, located: false, items: [], mapSearchUrl: err.response.data.mapSearchUrl, nights });
    } finally {
      setLoading(false);
    }
  }

  const field = "rounded-xl border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 outline-none focus:border-gray-400";
  return (
    <section className={`rounded-2xl border border-gray-200/80 bg-white p-4 lg:p-5 ${className}`} aria-labelledby="stay-search-heading">
      <h2 id="stay-search-heading" className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
        <BedDouble className="h-4 w-4 text-jz-accent" /> {t("stays.heading")}
      </h2>
      <p className="mt-0.5 text-xs text-gray-500">{t("stays.sub")}</p>
      <form onSubmit={search} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {t("stays.checkin")}
          <input type="date" value={checkin} min={localDay(0)} onChange={(e) => setCheckin(e.target.value)} required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {t("stays.nights")}
          <select value={nights} onChange={(e) => setNights(Number(e.target.value))} className={field}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {t("stays.nightsValue", { count: n })}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {t("stays.adults")}
          <select value={adults} onChange={(e) => setAdults(Number(e.target.value))} className={field}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {t("stays.adultsValue", { count: n })}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={loading || !checkin} className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("stays.search")}
        </button>
      </form>

      {error && <p className="mt-3 text-xs text-jz-warm-text">{error}</p>}
      {!result && preview}

      {result && (!result.configured || !result.located) && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
          <p>{t(result.configured ? "stays.noPosition" : "stays.notConfigured")}</p>
          <a href={result.mapSearchUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-bold text-jz-accent hover:underline">
            <MapPin className="h-3.5 w-3.5" /> {t("stays.mapSearch")}
          </a>
        </div>
      )}

      {result?.configured && result.located && (
        <>
          {result.items.length === 0 ? (
            <p className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">{t("stays.none")}</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {result.items.slice(0, 10).map((h) => (
                <li key={h.id} className="overflow-hidden rounded-2xl border border-gray-200">
                  <div className="flex gap-3 p-3">
                    {h.imageUrl ? (
                      <img src={h.imageUrl} alt="" loading="lazy" className="h-20 w-24 shrink-0 rounded-xl bg-gray-100 object-cover" />
                    ) : (
                      <span className="flex h-20 w-24 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                        <BedDouble className="h-6 w-6 text-gray-400" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-snug text-jz-ink">
                        {linkedHotelNo === h.id && <span className="mr-1 rounded-full bg-jz-tint px-1.5 py-0.5 text-[10px] text-jz-accent">{t("stays.thisPost")}</span>}
                        {h.name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                        {h.reviewAverage != null && (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-gray-700">
                            <Star className="h-3 w-3 fill-jz-warm text-jz-warm" /> {h.reviewAverage.toFixed(1)}
                            <span className="font-normal text-gray-400">({h.reviewCount})</span>
                          </span>
                        )}
                        {h.minChargeYen != null && <span>{t("stays.from", { price: yen(h.minChargeYen) })}</span>}
                      </p>
                      {h.access && <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{h.access}</p>}
                    </div>
                  </div>
                  {h.plans.length > 0 && (
                    <ul className="divide-y divide-gray-100 border-t border-gray-100">
                      {h.plans.map((p) => (
                        <li key={p.reserveUrl} className="flex items-center gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-gray-800">{p.name}</p>
                            <p className="flex items-center gap-1.5 text-[10px] text-gray-500">
                              {p.roomName && <span className="truncate">{p.roomName}</span>}
                              {p.breakfast && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Coffee className="h-3 w-3" /> {t("stays.breakfast")}
                                </span>
                              )}
                              {p.dinner && (
                                <span className="inline-flex items-center gap-0.5">
                                  <UtensilsCrossed className="h-3 w-3" /> {t("stays.dinner")}
                                </span>
                              )}
                            </p>
                          </div>
                          {p.totalYen != null && (
                            <p className="shrink-0 text-right text-sm font-black tabular-nums text-jz-ink">
                              {yen(p.totalYen)}
                              <span className="block text-[9px] font-normal text-gray-500">{t("stays.total", { nights: result.nights, adults })}</span>
                            </p>
                          )}
                          <a
                            href={p.reserveUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            onClick={() => {
                              // Into the しおり at once, as 手続き中 (asked about on return).
                              if (!user) return;
                              void recordPendingBooking({
                                name: h.name,
                                address: h.address ?? "",
                                checkin,
                                checkout: addDays(checkin, nights),
                                adults,
                                planName: p.name,
                                totalYen: p.totalYen,
                                url: h.planListUrl,
                              })
                                .then((trip) => trip && showToast(t("reservation.recorded", { trip })))
                                .catch(() => {});
                            }}
                            className="shrink-0 rounded-full bg-jz-accent px-3 py-1.5 text-xs font-bold text-white active:scale-95"
                          >
                            {t("stays.reserve")}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <a href={h.planListUrl} target="_blank" rel="noopener noreferrer sponsored" className="flex items-center justify-center gap-1 border-t border-gray-100 py-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-50">
                    {t("stays.allPlans")} <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 rounded-xl bg-jz-tint px-3 py-2 text-[11px] leading-relaxed text-jz-ink">{t("stays.afterBooking")}</p>
          <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
            {t("stays.note")}
            {result.affiliate && ` ${t("stays.affiliate")}`}
          </p>
          <a href="https://webservice.rakuten.co.jp/" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[10px] text-gray-400 hover:underline">
            Supported by Rakuten Developers
          </a>
        </>
      )}
    </section>
  );
}
