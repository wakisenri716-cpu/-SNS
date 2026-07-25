import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { REEL_CATEGORIES, type Reel, type ReelCategory } from "../types";

const inputClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-teal-500";

// Matches the backend's multer limit (see backend/src/middleware/upload.ts) — checked
// client-side too so oversized files fail fast instead of uploading for a long time
// only to be rejected by the server at the end.
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

export default function ReelUploader({ onCreated }: { onCreated: (reel: Reel) => void }) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<ReelCategory>("nature");
  const [locationName, setLocationName] = useState("");
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError(t("reelUploader.videoRequiredError"));
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t("reelUploader.fileTooLargeError"));
      return;
    }
    setSubmitting(true);
    setUploadPercent(0);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("caption", caption);
      fd.append("category", category);
      if (locationName) fd.append("locationName", locationName);
      if (locationLat) fd.append("locationLat", locationLat);
      if (locationLng) fd.append("locationLng", locationLng);
      const { data } = await api.post("/reels", fd, {
        onUploadProgress: (e) => {
          if (e.total) setUploadPercent(Math.round((e.loaded / e.total) * 100));
        },
      });
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
      setUploadPercent(0);
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
      <label className="text-xs font-medium text-gray-500">
        {t("reelUploader.categoryLabel")}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ReelCategory)}
          className={`mt-1 block w-full ${inputClass}`}
        >
          {REEL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </select>
      </label>
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
      {submitting && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-teal-600 transition-all"
              style={{ width: `${uploadPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {uploadPercent < 100 ? t("reelUploader.uploading", { percent: uploadPercent }) : t("reelUploader.processing")}
          </p>
        </div>
      )}
      <button
        disabled={submitting}
        className="rounded-lg bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {t("reelUploader.submit")}
      </button>
    </form>
  );
}
