import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Municipality, Reel } from "../types";

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
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="text-xs text-white/60">
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
        <label key={key} className="text-xs text-white/60">
          {label}
          <textarea
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            rows={3}
            className="mt-1 block w-full rounded border border-white/20 bg-transparent p-2 text-sm text-white"
          />
        </label>
      ))}
      <button disabled={saving} className="rounded bg-purple-600 py-2 text-sm font-medium disabled:opacity-50">
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
    <form onSubmit={submit} className="flex flex-col gap-3 rounded border border-white/10 p-3">
      <h3 className="text-sm font-semibold">新しいリールを投稿</h3>
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
        className="rounded border border-white/20 bg-transparent p-2 text-sm"
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          placeholder="場所名（例：○○展望台）"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          className="col-span-3 rounded border border-white/20 bg-transparent p-2 text-sm"
        />
        <input
          placeholder="緯度"
          value={locationLat}
          onChange={(e) => setLocationLat(e.target.value)}
          className="rounded border border-white/20 bg-transparent p-2 text-sm"
        />
        <input
          placeholder="経度"
          value={locationLng}
          onChange={(e) => setLocationLng(e.target.value)}
          className="rounded border border-white/20 bg-transparent p-2 text-sm"
        />
      </div>
      <p className="text-xs text-white/40">
        場所を入力すると、アクセス情報（交通案内）が自動表示されます（現在は仮データです。MaaS連携後に実データへ切替予定）。
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button disabled={submitting} className="rounded bg-purple-600 py-2 text-sm font-medium disabled:opacity-50">
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
    <div className="flex flex-col gap-6 p-4">
      <section>
        <h2 className="mb-3 text-lg font-bold">{municipality.name} 管理画面</h2>
        <ReelUploader onCreated={(reel) => setReels((prev) => [reel, ...prev])} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">投稿済みリール（{reels.length}件）</h3>
        <div className="flex flex-col gap-2">
          {reels.map((reel) => (
            <div key={reel.id} className="flex items-center gap-2 rounded border border-white/10 p-2">
              <video src={reel.videoUrl} className="h-16 w-10 rounded bg-black object-cover" muted />
              <p className="flex-1 truncate text-xs text-white/80">{reel.caption || "(無題)"}</p>
              <button onClick={() => removeReel(reel.id)} className="rounded bg-red-600/70 px-2 py-1 text-xs">
                削除
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">自治体プロフィール編集</h3>
        <ProfileEditor municipality={municipality} onUpdated={setMunicipality} />
      </section>
    </div>
  );
}
