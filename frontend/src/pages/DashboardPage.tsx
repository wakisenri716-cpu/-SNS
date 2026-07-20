import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelUploader from "../components/ReelUploader";
import ReelManageGrid from "../components/ReelManageGrid";
import type { Municipality, Reel } from "../types";

const inputClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500";

function ProfileEditor({ municipality, onUpdated }: { municipality: Municipality; onUpdated: (m: Municipality) => void }) {
  const [form, setForm] = useState({
    description: municipality.description,
    accessInfo: municipality.accessInfo,
    lodgingInfo: municipality.lodgingInfo,
    restaurantInfo: municipality.restaurantInfo,
    tourismInfo: municipality.tourismInfo,
  });
  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put("/municipalities/me/profile", form);
      onUpdated(data);
      if (avatarFile) {
        const fd = new FormData();
        fd.append("avatar", avatarFile);
        const { data: withAvatar } = await api.post("/municipalities/me/avatar", fd);
        onUpdated(withAvatar);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
      <label className="text-xs font-medium text-gray-500">
        アイコン画像
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
          className="mt-1 block text-xs"
        />
      </label>
      {(
        [
          ["description", "自治体紹介"],
          ["tourismInfo", "観光情報"],
          ["accessInfo", "アクセス方法"],
          ["lodgingInfo", "宿情報"],
          ["restaurantInfo", "飲食店情報"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="text-xs font-medium text-gray-500">
          {label}
          <textarea
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            rows={3}
            className={`mt-1 block w-full ${inputClass}`}
          />
        </label>
      ))}
      <button
        disabled={saving}
        className="rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        プロフィールを保存
      </button>
    </form>
  );
}

interface LinkedCompany {
  id: string;
  name: string;
  createdAt: string;
}

export default function DashboardPage() {
  const { municipality, setMunicipality } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [companies, setCompanies] = useState<LinkedCompany[]>([]);

  useEffect(() => {
    if (!municipality) return;
    api.get("/reels/mine").then(({ data }) => setReels(data.items));
    api.get("/municipalities/me/companies").then(({ data }) => setCompanies(data));
  }, [municipality?.id]);

  if (!municipality) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <section>
        <h2 className="mb-3 text-lg font-bold text-gray-900">{municipality.name} 管理画面</h2>
        <ReelUploader onCreated={(reel) => setReels((prev) => [reel, ...prev])} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-600">
          投稿済みリール（{reels.length}件・紐づく企業の投稿を含む）
        </h3>
        <ReelManageGrid reels={reels} onRemoved={(id) => setReels((prev) => prev.filter((r) => r.id !== id))} />
      </section>

      <section>
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
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-600">自治体プロフィール編集</h3>
        <ProfileEditor municipality={municipality} onUpdated={setMunicipality} />
      </section>
    </div>
  );
}
