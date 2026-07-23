import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Reel } from "../types";

export default function MyPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [likedReels, setLikedReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/reels/liked")
      .then(({ data }) => setLikedReels(data.items))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-xl font-semibold text-gray-600">
          {user.name.slice(0, 1)}
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{user.name}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400">{t("myPage.viewOnlyNotice")}</p>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-600">
          {t("myPage.likedHeading", { count: likedReels.length })}
        </h2>
        {loading ? (
          <p className="text-sm text-gray-400">{t("myPage.loading")}</p>
        ) : likedReels.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
            {t("myPage.emptyLiked")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {likedReels.map((reel) => (
              <Link key={reel.id} to={`/municipalities/${reel.municipality.id}`} className="relative block">
                <video src={reel.videoUrl} className="aspect-video w-full rounded-lg bg-gray-200 object-cover" muted />
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
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
