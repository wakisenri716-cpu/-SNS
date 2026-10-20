import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import AutoplayVideo from "./AutoplayVideo";
import type { NearbyReel } from "../types";

// Pitch deck item "(1) 近隣の観光スポットの掲載": while looking at one post's access
// info, let the viewer discover other posts located near it, regardless of
// which municipality/company posted them. See GET /reels/:id/nearby.
export default function NearbySpots({ reelId }: { reelId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<NearbyReel[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    api
      .get<{ items: NearbyReel[] }>(`/reels/${reelId}/nearby`)
      .then(({ data }) => {
        if (!cancelled) setItems(data.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reelId]);

  if (items == null) return null;

  return (
    <div className="mt-6 border-t border-gray-100 pt-5">
      <h2 className="text-sm font-bold text-gray-900">📍 {t("reelAccessPage.nearbyHeading")}</h2>
      <p className="mt-0.5 text-xs text-gray-400">{t("reelAccessPage.nearbySubtitle")}</p>

      {items.length === 0 ? (
        <p className="mt-3 text-xs text-gray-400">{t("reelAccessPage.nearbyEmpty")}</p>
      ) : (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/reels/${item.id}/access`}
              state={{ reel: item }}
              className="block w-32 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white hover:border-teal-300 md:w-40"
            >
              <div className="relative aspect-square w-full bg-gray-900">
                <AutoplayVideo src={item.videoUrl} className="h-full w-full object-cover" />
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {item.distanceMeters < 1000
                    ? t("reelAccessPage.nearbyDistanceMeters", { m: Math.max(10, Math.round(item.distanceMeters / 10) * 10) })
                    : t("reelAccessPage.nearbyDistance", { km: (item.distanceMeters / 1000).toFixed(1) })}
                </span>
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-semibold text-gray-900">
                  {item.locationName || item.municipality.name}
                </p>
                <p className="truncate text-[11px] text-gray-400">{t(`category.${item.category}`)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
