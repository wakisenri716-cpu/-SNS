import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Reel } from "../types";

const inputClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500";

export default function ReelUploader({ onCreated }: { onCreated: (reel: Reel) => void }) {
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
