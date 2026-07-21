import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import AutoplayVideo from "../components/AutoplayVideo";
import type { Municipality } from "../types";

const TABS = [
  { key: "accessInfo", label: "アクセス方法" },
  { key: "lodgingInfo", label: "宿情報" },
  { key: "restaurantInfo", label: "飲食店" },
  { key: "tourismInfo", label: "観光情報" },
] as const;

export default function MunicipalityProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tourismInfo");

  useEffect(() => {
    api.get(`/municipalities/${id}`).then(({ data }) => setMunicipality(data));
  }, [id]);

  if (!municipality) return <p className="p-10 text-center text-gray-400">読み込み中...</p>;

  const [featured, ...rest] = municipality.reels ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {featured && (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="relative">
            <AutoplayVideo src={featured.videoUrl} className="aspect-video w-full bg-black object-cover" />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white ring-2 ring-white/40">
                {municipality.avatarUrl ? (
                  <img src={municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
                ) : (
                  municipality.name.slice(0, 1)
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white drop-shadow">{municipality.name}</p>
                <p className="truncate text-xs text-white/80 drop-shadow">
                  {municipality.prefecture}
                  {featured.postedByCompany && ` ・投稿: ${featured.postedByCompany.name}`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex bg-gray-800">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 text-xs font-medium ${
                  tab === t.key ? "bg-gray-900 text-white" : "text-gray-300 hover:bg-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="whitespace-pre-wrap bg-gray-50 p-3 text-sm text-gray-700">
            {municipality[tab] || "情報が未登録です"}
          </div>
        </div>
      )}

      {!featured && (
        <div>
          <h1 className="text-lg font-bold text-gray-900">{municipality.name}</h1>
          <p className="text-sm text-gray-500">{municipality.prefecture}</p>
        </div>
      )}
      {municipality.description && <p className="mt-3 text-sm text-gray-700">{municipality.description}</p>}

      {municipality.otaLinks.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">宿・予約を探す</h2>
          <div className="flex flex-col gap-2">
            {municipality.otaLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
              >
                {link.label} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">投稿一覧</h2>
        <div className="grid grid-cols-2 gap-2">
          {(featured ? rest : []).map((reel) => (
            <div key={reel.id} className="overflow-hidden rounded-lg">
              <video src={reel.videoUrl} className="aspect-video w-full bg-gray-200 object-cover" muted />
              {reel.postedByCompany && (
                <p className="truncate bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
                  投稿: {reel.postedByCompany.name}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
