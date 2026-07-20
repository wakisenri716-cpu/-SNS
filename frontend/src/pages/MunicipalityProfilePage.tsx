import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Municipality } from "../types";

const TABS = [
  { key: "tourismInfo", label: "観光情報" },
  { key: "accessInfo", label: "アクセス方法" },
  { key: "lodgingInfo", label: "宿情報" },
  { key: "restaurantInfo", label: "飲食店" },
] as const;

export default function MunicipalityProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tourismInfo");

  useEffect(() => {
    api.get(`/municipalities/${id}`).then(({ data }) => setMunicipality(data));
  }, [id]);

  if (!municipality) return <p className="p-6 text-center text-white/60">読み込み中...</p>;

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-xl">
          {municipality.avatarUrl ? (
            <img src={municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
          ) : (
            municipality.name.slice(0, 1)
          )}
        </div>
        <div>
          <h1 className="text-lg font-bold">{municipality.name}</h1>
          <p className="text-sm text-white/60">{municipality.prefecture}</p>
        </div>
      </div>
      {municipality.description && <p className="mt-3 text-sm text-white/80">{municipality.description}</p>}

      <div className="mt-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs ${
              tab === t.key ? "bg-purple-600" : "bg-white/10 text-white/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3 whitespace-pre-wrap rounded bg-white/5 p-3 text-sm text-white/80">
        {municipality[tab] || "情報が未登録です"}
      </div>

      {municipality.otaLinks.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-white/70">宿・予約を探す</h2>
          <div className="flex flex-col gap-2">
            {municipality.otaLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-white/20 px-3 py-2 text-sm"
              >
                {link.label} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-white/70">投稿一覧</h2>
        <div className="grid grid-cols-3 gap-1">
          {municipality.reels?.map((reel) => (
            <video key={reel.id} src={reel.videoUrl} className="aspect-[9/16] w-full bg-neutral-800 object-cover" muted />
          ))}
        </div>
      </div>
    </div>
  );
}
