import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Municipality, Reel } from "../types";

interface RecommendItem {
  id: string;
  videoUrl: string;
  caption: string;
  municipality: { id: string; name: string; prefecture: string };
  likeCount: number;
  commentCount: number;
  score: number;
}

export default function SearchPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [recommend, setRecommend] = useState<RecommendItem[]>([]);

  useEffect(() => {
    api.get("/search/recommend").then(({ data }) => setRecommend(data.items));
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setMunicipalities([]);
      setReels([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get("/search", { params: { q } }).then(({ data }) => {
        setMunicipalities(data.municipalities);
        setReels(data.reels);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("search.placeholder")}
        className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-teal-500"
      />

      {q.trim() ? (
        <div className="mt-6 flex flex-col gap-6">
          {municipalities.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-gray-500">{t("search.municipalitiesHeading")}</h3>
              <div className="flex flex-col gap-2">
                {municipalities.map((m) => (
                  <Link
                    key={m.id}
                    to={`/municipalities/${m.id}`}
                    className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 hover:bg-gray-50"
                  >
                    {m.name}（{m.prefecture}）
                  </Link>
                ))}
              </div>
            </div>
          )}
          {reels.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-gray-500">{t("search.postsHeading")}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {reels.map((r) => (
                  <video
                    key={r.id}
                    src={r.videoUrl}
                    className="aspect-video w-full rounded-lg bg-gray-200 object-cover"
                    muted
                  />
                ))}
              </div>
            </div>
          )}
          {municipalities.length === 0 && reels.length === 0 && (
            <p className="text-sm text-gray-400">{t("search.noResults")}</p>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold text-gray-500">{t("search.recommendHeading")}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recommend.map((r) => (
              <Link key={r.id} to={`/municipalities/${r.municipality.id}`} className="relative block">
                <video src={r.videoUrl} className="aspect-video w-full rounded-lg bg-gray-200 object-cover" muted />
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  {r.municipality.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
