import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
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

function ReelUploader({ onCreated }: { onCreated: (reel: Reel) => void }) {
  const [caption, setCaption] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("動画ファイルを選択してください");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("caption", caption);
      if (locationName) fd.append("locationName", locationName);
      if (locationLat) fd.append("locationLat", locationLat);
      if (locationLng) fd.append("locationLng", locationLng);
      const { data } = await api.post("/reels", fd);
      onCreated(data);
      setCaption("");
      setLocationName("");
      setLocationLat("");
      setLocationLng("");
      setFile(null);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "投稿に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">新しいリールを投稿</h3>
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs"
      />
      <textarea
        placeholder="説明文"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        className={inputClass}
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          placeholder="場所名（例：○○展望台）"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          className={`col-span-3 ${inputClass}`}
        />
        <input
          placeholder="緯度"
          value={locationLat}
          onChange={(e) => setLocationLat(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="経度"
          value={locationLng}
          onChange={(e) => setLocationLng(e.target.value)}
          className={inputClass}
        />
      </div>
      <p className="text-xs text-gray-400">
        場所を入力すると、アクセス情報（交通案内）が自動表示されます（現在は仮データです。MaaS連携後に実データへ切替予定）。
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        disabled={submitting}
        className="rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        投稿する
      </button>
    </form>
  );
}

export default function DashboardPage() {
  const { municipality, setMunicipality } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);

  useEffect(() => {
    if (!municipality) return;
    api.get(`/municipalities/${municipality.id}`).then(({ data }) => setReels(data.reels ?? []));
  }, [municipality?.id]);

  if (!municipality) return null;

  async function removeReel(id: string) {
    await api.delete(`/reels/${id}`);
    setReels((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <section>
        <h2 className="mb-3 text-lg font-bold text-gray-900">{municipality.name} 管理画面</h2>
        <ReelUploader onCreated={(reel) => setReels((prev) => [reel, ...prev])} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-600">投稿済みリール（{reels.length}件）</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {reels.map((reel) => (
            <div key={reel.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <video src={reel.videoUrl} className="aspect-video w-full bg-gray-200 object-cover" muted />
              <div className="flex items-center gap-2 p-2">
                <p className="flex-1 truncate text-xs text-gray-700">{reel.caption || "(無題)"}</p>
                <button
                  onClick={() => removeReel(reel.id)}
                  className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-600">自治体プロフィール編集</h3>
        <ProfileEditor municipality={municipality} onUpdated={setMunicipality} />
      </section>
    </div>
  );
}
