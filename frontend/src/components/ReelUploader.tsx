import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Film } from "lucide-react";
import { api } from "../api/client";
import { REEL_CATEGORIES, type Reel, type ReelCategory, type TravelerTag } from "../types";
import { TravelerTagPicker } from "./TravelerTagChips";
import { BestMonthsPicker } from "./BestMonths";

const inputClass =
  "rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400";

// Matches the backend's multer limit (see backend/src/middleware/upload.ts) — checked
// client-side too so oversized files fail fast instead of uploading for a long time
// only to be rejected by the server at the end.
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

export default function ReelUploader({ onCreated }: { onCreated: (reel: Reel) => void }) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<ReelCategory>("nature");
  const [travelerTags, setTravelerTags] = useState<TravelerTag[]>([]);
  const [bestMonths, setBestMonths] = useState<number[]>([]);
  const [locationName, setLocationName] = useState("");
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // A local preview of the chosen video, released when it changes.
  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type.startsWith("video/")) setFile(dropped);
  }

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
      fd.append("travelerTags", travelerTags.join(","));
      fd.append("bestMonths", bestMonths.join(","));
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
      setTravelerTags([]);
      setBestMonths([]);
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
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">{t("reelUploader.heading")}</h3>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed p-3 transition focus-within:ring-2 focus-within:ring-jz-red/30 ${
          dragging ? "border-jz-red bg-jz-tint" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        {previewUrl ? (
          <video src={previewUrl} className="on-media h-24 w-[54px] shrink-0 rounded-lg bg-black object-cover" muted playsInline autoPlay loop />
        ) : (
          <span className="flex h-24 w-[54px] shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
            <Film className="h-6 w-6" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-jz-ink">
            {file ? t("reelUploader.changeVideo") : t("reelUploader.chooseVideo")}
          </span>
          <span className={`mt-0.5 block text-xs text-gray-500 ${file ? "truncate" : "leading-relaxed"}`}>
            {file ? `${file.name}・${(file.size / 1024 / 1024).toFixed(1)}MB` : t("reelUploader.chooseVideoHint")}
          </span>
        </span>
      </label>
      <textarea
        aria-label={t("reelUploader.captionPlaceholder")}
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
      <div className="text-xs font-medium text-gray-500">
        {t("reelUploader.travelerTagsLabel")}
        <div className="mt-1">
          <TravelerTagPicker value={travelerTags} onChange={setTravelerTags} />
        </div>
      </div>
      <div className="text-xs font-medium text-gray-500">
        {t("season.pickerLabel")}
        <div className="mt-1">
          <BestMonthsPicker value={bestMonths} onChange={setBestMonths} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          aria-label={t("reelUploader.locationNamePlaceholder")}
          placeholder={t("reelUploader.locationNamePlaceholder")}
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          className={`col-span-3 ${inputClass}`}
        />
        <input
          aria-label={t("reelUploader.latPlaceholder")}
          inputMode="decimal"
          placeholder={t("reelUploader.latPlaceholder")}
          value={locationLat}
          onChange={(e) => setLocationLat(e.target.value)}
          className={inputClass}
        />
        <input
          aria-label={t("reelUploader.lngPlaceholder")}
          inputMode="decimal"
          placeholder={t("reelUploader.lngPlaceholder")}
          value={locationLng}
          onChange={(e) => setLocationLng(e.target.value)}
          className={inputClass}
        />
      </div>
      <p className="text-xs text-gray-500">{t("reelUploader.maasNote")}</p>
      {error && <p className="text-xs text-jz-red">{error}</p>}
      {submitting && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-900 transition-all"
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
        className="rounded-full bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {t("reelUploader.submit")}
      </button>
    </form>
  );
}
