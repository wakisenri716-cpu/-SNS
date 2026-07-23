import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Reel } from "../types";

const inputClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-teal-500";

export default function ReelUploader({ onCreated }: { onCreated: (reel: Reel) => void }) {
  const { t } = useTranslation();
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
      setError(t("reelUploader.videoRequiredError"));
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
      setError(err?.response?.data?.error ?? t("reelUploader.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">{t("reelUploader.heading")}</h3>
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs"
      />
      <textarea
        placeholder={t("reelUploader.captionPlaceholder")}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        className={inputClass}
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          placeholder={t("reelUploader.locationNamePlaceholder")}
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          className={`col-span-3 ${inputClass}`}
        />
        <input
          placeholder={t("reelUploader.latPlaceholder")}
          value={locationLat}
          onChange={(e) => setLocationLat(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder={t("reelUploader.lngPlaceholder")}
          value={locationLng}
          onChange={(e) => setLocationLng(e.target.value)}
          className={inputClass}
        />
      </div>
      <p className="text-xs text-gray-400">{t("reelUploader.maasNote")}</p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        disabled={submitting}
        className="rounded-lg bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {t("reelUploader.submit")}
      </button>
    </form>
  );
}
