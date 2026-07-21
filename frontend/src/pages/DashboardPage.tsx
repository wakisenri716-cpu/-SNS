import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelUploader from "../components/ReelUploader";
import AutoplayVideo from "../components/AutoplayVideo";
import type { Municipality, Reel } from "../types";

const TABS = [
  { key: "accessInfo", label: "アクセス方法" },
  { key: "lodgingInfo", label: "宿情報" },
  { key: "restaurantInfo", label: "飲食店" },
  { key: "tourismInfo", label: "観光情報" },
] as const;

interface LinkedCompany {
  id: string;
  name: string;
  createdAt: string;
}

function ProfileTabEditor({
  municipality,
  onUpdated,
}: {
  municipality: Municipality;
  onUpdated: (m: Municipality) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tourismInfo");
  const [value, setValue] = useState(municipality[tab]);
  const [saving, setSaving] = useState(false);

  function selectTab(key: (typeof TABS)[number]["key"]) {
    setTab(key);
    setValue(municipality[key]);
  }

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put("/municipalities/me/profile", { [tab]: value });
      onUpdated(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-b-xl border border-t-0 border-gray-200">
      <div className="flex bg-gray-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`flex-1 py-2.5 text-xs font-medium ${
              tab === t.key ? "bg-gray-900 text-white" : "text-gray-300 hover:bg-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="bg-gray-50 p-3">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          placeholder={`${TABS.find((t) => t.key === tab)!.label}を入力`}
          className="block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 outline-none focus:border-blue-500"
        />
        <button
          onClick={save}
          disabled={saving}
          className="mt-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          この項目を保存
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { municipality, setMunicipality } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [companies, setCompanies] = useState<LinkedCompany[]>([]);
  const [showUploader, setShowUploader] = useState(false);

  useEffect(() => {
    if (!municipality) return;
    api.get("/reels/mine").then(({ data }) => setReels(data.items));
    api.get("/municipalities/me/companies").then(({ data }) => setCompanies(data));
  }, [municipality?.id]);

  if (!municipality) return null;

  async function uploadAvatar(file: File) {
    const fd = new FormData();
    fd.append("avatar", file);
    const { data } = await api.post("/municipalities/me/avatar", fd);
    setMunicipality(data);
  }

  const [featured, ...rest] = reels;

  const avatarInput = (
    <label className="group relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white ring-2 ring-white/40">
      {municipality.avatarUrl ? (
        <img src={municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
      ) : (
        municipality.name.slice(0, 1)
      )}
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[9px] text-white opacity-0 group-hover:opacity-100">
        変更
      </span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadAvatar(file);
        }}
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-3 text-lg font-bold text-gray-900">{municipality.name} 管理画面</h1>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        {featured ? (
          <div className="relative">
            <AutoplayVideo src={featured.videoUrl} className="aspect-video w-full bg-black object-cover" />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-3">
              <div className="pointer-events-auto">{avatarInput}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white drop-shadow">{municipality.name}</p>
                <p className="truncate text-xs text-white/80 drop-shadow">
                  {municipality.prefecture}
                  {featured.postedByCompany && ` ・投稿: ${featured.postedByCompany.name}`}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowUploader(true)}
            className="flex aspect-video w-full items-center justify-center bg-gray-50 text-gray-300 hover:text-gray-400"
          >
            <span className="text-5xl leading-none">＋</span>
          </button>
        )}
      </div>

      <ProfileTabEditor municipality={municipality} onUpdated={setMunicipality} />

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">
          投稿一覧（{reels.length}件・紐づく企業の投稿を含む）
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowUploader(true)}
            className="flex aspect-video w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-300 hover:border-gray-400 hover:text-gray-400"
          >
            <span className="text-4xl leading-none">＋</span>
          </button>
          {(featured ? rest : []).map((reel) => (
            <div key={reel.id} className="group relative overflow-hidden rounded-lg">
              <video src={reel.videoUrl} className="aspect-video w-full bg-gray-200 object-cover" muted />
              {reel.postedByCompany && (
                <p className="truncate bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
                  投稿: {reel.postedByCompany.name}
                </p>
              )}
              <button
                onClick={async () => {
                  await api.delete(`/reels/${reel.id}`);
                  setReels((prev) => prev.filter((r) => r.id !== reel.id));
                }}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">紐づいている企業（{companies.length}件）</h3>
        {companies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
            まだこの自治体に紐づいた企業アカウントはありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {companies.map((c) => (
              <li key={c.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showUploader && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setShowUploader(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <ReelUploader
              onCreated={(reel) => {
                setReels((prev) => [reel, ...prev]);
                setShowUploader(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
