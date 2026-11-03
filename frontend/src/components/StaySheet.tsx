import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BedDouble, ExternalLink, MapPin, Star, X } from "lucide-react";
import { api } from "../api/client";
import StaySearch from "./StaySearch";
import type { Reel } from "../types";

interface NearHotel {
  id: number;
  name: string;
  imageUrl: string | null;
  minChargeYen: number | null;
  reviewAverage: number | null;
  reviewCount: number;
  access: string;
  planListUrl: string;
}
interface Near {
  configured: boolean;
  affiliate?: boolean;
  linked: { no: number; name: string } | null;
  hotels: NearHotel[];
  mapSearchUrl: string;
}

// 宿を予約, from a post: the real hotels around it (楽天トラベル) — the post's
// own hotel first when it's a lodging post — and rooms free on your dates.
// Booking itself opens on 楽天トラベル.
export default function StaySheet({ reel, onClose }: { reel: Reel; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [near, setNear] = useState<Near | null>(null);
  const [failed, setFailed] = useState(false);
  const place = reel.locationName || reel.municipality.name;

  useEffect(() => {
    api
      .get<Near>(`/stays/near/${reel.id}`)
      .then(({ data }) => setNear(data))
      .catch(() => setFailed(true));
  }, [reel.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preview =
    near && near.hotels.length > 0 ? (
      <div className="mt-4">
        <p className="text-xs font-bold text-gray-500">{t("stays.nearHeading")}</p>
        <ul className="mt-2 space-y-2">
          {near.hotels.map((h) => (
            <li key={h.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 p-2.5">
              {h.imageUrl ? (
                <img src={h.imageUrl} alt="" loading="lazy" className="h-14 w-16 shrink-0 rounded-xl bg-gray-100 object-cover" />
              ) : (
                <span className="flex h-14 w-16 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                  <BedDouble className="h-5 w-5 text-gray-400" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-jz-ink">
                  {near.linked?.no === h.id && <span className="mr-1 rounded-full bg-jz-tint px-1.5 py-0.5 text-[10px] text-jz-accent">{t("stays.thisPost")}</span>}
                  {h.name}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                  {h.reviewAverage != null && (
                    <span className="inline-flex items-center gap-0.5 font-semibold text-gray-700">
                      <Star className="h-3 w-3 fill-jz-warm text-jz-warm" /> {h.reviewAverage.toFixed(1)}
                    </span>
                  )}
                  {h.minChargeYen != null && <span>{t("stays.from", { price: `¥${h.minChargeYen.toLocaleString(i18n.language)}` })}</span>}
                </p>
                {h.access && <p className="truncate text-[11px] text-gray-500">{h.access}</p>}
              </div>
              <a href={h.planListUrl} target="_blank" rel="noopener noreferrer sponsored" aria-label={t("stays.allPlans")} className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100">
                <ExternalLink className="h-4 w-4" />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-gray-500">{t("stays.pickDates")}</p>
        {near.affiliate && <p className="mt-1 text-[10px] text-gray-500">{t("stays.affiliate")}</p>}
        <a href="https://webservice.rakuten.co.jp/" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[10px] text-gray-400 hover:underline">
          Supported by Rakuten Developers
        </a>
      </div>
    ) : null;

  return createPortal(
    // A portal still bubbles React events to the post / viewer it was opened
    // from (taps, swipes, keys); keep them in the sheet.
    <div
      className="animate-fade-in fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("stays.sheetTitle", { place })}
        className="animate-sheet-in flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-white pb-[env(safe-area-inset-bottom)] md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300" aria-hidden />
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <BedDouble className="h-5 w-5 text-jz-accent" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">
            {reel.rakutenHotel ? t("stays.bookThis", { name: reel.rakutenHotel.name || place }) : t("stays.sheetTitle", { place })}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("reelViewer.closeLabel")} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {failed || (near && !near.configured) ? (
            <div className="mb-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <p>{t(failed ? "stays.error" : "stays.notConfigured")}</p>
              {near && (
                <a href={near.mapSearchUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-bold text-jz-accent">
                  <MapPin className="h-3.5 w-3.5" /> {t("stays.mapSearch")}
                </a>
              )}
            </div>
          ) : null}
          <StaySearch reelId={reel.id} className="border-0 p-0 lg:p-0" preview={preview} linkedHotelNo={near?.linked?.no ?? reel.rakutenHotel?.no ?? null} />
        </div>
      </div>
    </div>,
    document.body
  );
}
