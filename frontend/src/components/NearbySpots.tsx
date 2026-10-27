import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import AutoplayVideo from "./AutoplayVideo";
import { REEL_CATEGORIES, type NearbyReel, type NearbyTourismSpot, type ReelCategory } from "../types";
import { MapPin } from "lucide-react";

// Pitch deck item "(1) 近隣の観光スポットの掲載": while looking at one post's access
// info, let the viewer discover other posts located near it, regardless of
// which municipality/company posted them, optionally narrowed to one category
// (近くの宿・飲食店…). See GET /reels/:id/nearby.
export default function NearbySpots({ reelId }: { reelId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<NearbyReel[] | null>(null);
  const [spots, setSpots] = useState<NearbyTourismSpot[]>([]);
  const [category, setCategory] = useState<ReelCategory | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: NearbyReel[]; spots: NearbyTourismSpot[] }>(`/reels/${reelId}/nearby`, {
        params: category ? { category } : {},
      })
      .then(({ data }) => {
        if (cancelled) return;
        setItems(data.items);
        setSpots(data.spots);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setSpots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reelId, category]);

  if (items == null) return null;

  const distanceLabel = (meters: number) =>
    meters < 1000
      ? t("reelAccessPage.nearbyDistanceMeters", { m: Math.max(10, Math.round(meters / 10) * 10) })
      : t("reelAccessPage.nearbyDistance", { km: (meters / 1000).toFixed(1) });

  return (
    <div className="mt-6 border-t border-gray-100 pt-5">
      <h2 className="text-sm font-bold text-gray-900">{t("reelAccessPage.nearbyHeading")}</h2>
      <p className="mt-0.5 text-xs text-gray-400">{t("reelAccessPage.nearbySubtitle")}</p>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {[null, ...REEL_CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            onClick={() => setCategory(c)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
              category === c ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {c ? t(`category.${c}`) : t("reelAccessPage.nearbyAll")}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-xs text-gray-400">
          {category ? t("reelAccessPage.nearbyEmptyCategory", { category: t(`category.${category}`) }) : t("reelAccessPage.nearbyEmpty")}
        </p>
      ) : (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/reels/${item.id}/access`}
              state={{ reel: item }}
              className="block w-32 shrink-0 overflow-hidden rounded-2xl border border-gray-200/80 bg-white hover:border-gray-300 md:w-40"
            >
              <div className="on-media relative aspect-square w-full bg-gray-900">
                <AutoplayVideo src={item.videoUrl} className="h-full w-full object-cover" />
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {distanceLabel(item.distanceMeters)}
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

      {spots.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500">{t("reelAccessPage.nearbySpotsHeading")}</p>
          <div className="mt-2 flex flex-col gap-2">
            {spots.map((spot) => (
              <Link
                key={spot.id}
                to={`/municipalities/${spot.municipality.id}`}
                className="block rounded-2xl border border-gray-200/80 bg-white p-3 hover:border-gray-300"
              >
                <div className="flex items-baseline gap-2">
                  <p className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm font-semibold text-gray-900"><MapPin className="h-3.5 w-3.5 shrink-0 text-gray-500" />{spot.name}</p>
                  <span className="shrink-0 text-[11px] text-gray-400">{distanceLabel(spot.distanceMeters)}</span>
                </div>
                <p className="text-[11px] text-gray-400">{spot.municipality.name}</p>
                {spot.description && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{spot.description}</p>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
