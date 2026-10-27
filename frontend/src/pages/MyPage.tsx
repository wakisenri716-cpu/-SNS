import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import Avatar from "../components/Avatar";
import Stamp from "../components/Stamp";
import { formatStampDate } from "../lib/stampDate";
import type { Reel } from "../types";

interface StampItem {
  visitedAt: string;
  reel: { id: string; locationName: string; municipality: { id: string; name: string; prefecture: string } };
}

export default function MyPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [likedReels, setLikedReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<{ points: number; reportCount: number; visitCount: number } | null>(null);
  const [stamps, setStamps] = useState<StampItem[] | null>(null);

  useEffect(() => {
    api
      .get("/reels/liked")
      .then(({ data }) => setLikedReels(data.items))
      .finally(() => setLoading(false));
    api.get("/auth/me/points").then(({ data }) => setPoints(data));
    api.get<{ items: StampItem[] }>("/auth/me/stamps").then(({ data }) => setStamps(data.items));
  }, []);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-[935px] px-4 py-6 md:px-5 md:py-8">
      <div className="flex items-center gap-5">
        <Avatar name={user.name} src={user.avatarUrl} size={80} />
        <div className="min-w-0">
          <h1 className="text-xl text-gray-900">{user.name}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400">{t("myPage.viewOnlyNotice")}</p>

      {points && (
        <div className="mt-6 flex items-center gap-4 rounded-lg bg-gray-100 px-4 py-3">
          <div>
            <p className="whitespace-nowrap text-xs font-semibold text-gray-500">{t("myPage.pointsLabel")}</p>
            <p className="text-2xl font-extrabold tabular-nums text-gray-900">
              {t("myPage.pointsValue", { points: points.points })}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-gray-500">
            {t("myPage.pointsNote", { count: points.reportCount })}
            <br />
            {t("stamps.pointsNote", { count: points.visitCount })}
          </p>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-bold text-gray-900">
          {t("stamps.bookHeading")}
          {stamps && <span className="ml-2 font-normal text-gray-400">{t("stamps.count", { count: stamps.length })}</span>}
        </h2>
        {stamps && stamps.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-gray-50 p-4 text-xs leading-relaxed text-gray-500">{t("stamps.bookEmpty")}</p>
        ) : (
          <div className="scrollbar-none -mx-4 mt-3 flex gap-5 overflow-x-auto px-4 pb-2 pt-2 md:mx-0 md:flex-wrap md:px-0">
            {(stamps ?? []).map((s) => (
              <Link key={s.reel.id} to={`/reels/${s.reel.id}/access`} className="flex w-24 shrink-0 flex-col items-center gap-1.5 text-center">
                <Stamp place={s.reel.locationName} date={formatStampDate(s.visitedAt)} size={92} />
                <span className="w-full truncate text-[11px] text-gray-500">{s.reel.municipality.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="-mx-4 mt-8 border-t border-gray-200 md:mx-0">
        <h2 className="px-4 py-3 text-center text-xs font-semibold tracking-wider text-gray-900 md:px-0">
          {t("myPage.likedHeading", { count: likedReels.length })}
        </h2>
        {loading ? (
          <p className="text-sm text-gray-400">{t("myPage.loading")}</p>
        ) : likedReels.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            {t("myPage.emptyLiked")}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-px md:gap-1">
            {likedReels.map((reel) => (
              <Link
                key={reel.id}
                to={`/municipalities/${reel.municipality.id}`}
                className="on-media relative block aspect-square overflow-hidden bg-gray-100"
                aria-label={reel.locationName || reel.municipality.name}
              >
                <video src={`${reel.videoUrl}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                <span className="absolute bottom-1.5 left-1.5 max-w-[90%] truncate text-[11px] font-semibold text-white drop-shadow">
                  {reel.municipality.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
