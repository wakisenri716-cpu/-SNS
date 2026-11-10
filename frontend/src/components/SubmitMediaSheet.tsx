import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ImagePlus, MapPin, X } from "lucide-react";
import { api } from "../api/client";
import { readExifGps, readExifTakenAt } from "../lib/exifGps";
import { resizeImageToBlob } from "../lib/resizeImage";
import { showToast } from "../lib/toast";

const PHOTO_MAX_SIDE = 2400;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

// 写真・動画を提供する: a traveler offers their own photo or video to a
// municipality for its posts. Photos are re-drawn on the device before
// upload, which drops the file's metadata; where and when it was taken are
// read first (and can be edited). The municipality reviews it; approval
// earns points, and it may then be posted with the traveler's name.
export default function SubmitMediaSheet({
  municipality,
  onClose,
}: {
  municipality: { id: string; name: string; listing?: boolean };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [where, setWhere] = useState<{ lat: number; lng: number } | null>(null);
  const [takenAt, setTakenAt] = useState<string | null>(null);
  const [credit, setCredit] = useState(true);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isVideo = !!file?.type.startsWith("video/");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.type.startsWith("video/") && f.size > MAX_VIDEO_BYTES) return setError(t("submit.tooBig"));
    setFile(f);
    setWhere(null);
    setTakenAt(null);
    if (f.type.startsWith("image/")) {
      const buf = await f.arrayBuffer();
      setWhere(readExifGps(buf));
      setTakenAt(readExifTakenAt(buf));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || !consent) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      if (isVideo) form.append("file", file);
      else form.append("file", (await resizeImageToBlob(file, PHOTO_MAX_SIDE, 0.9)).blob, "photo.jpg");
      form.append("municipalityId", municipality.id);
      form.append("description", description);
      form.append("locationName", locationName);
      if (where) {
        form.append("locationLat", String(where.lat));
        form.append("locationLng", String(where.lng));
      }
      if (takenAt) form.append("takenAt", takenAt);
      form.append("credit", credit ? "1" : "0");
      form.append("consent", "1");
      await api.post("/submissions", form);
      showToast(t(municipality.listing ? "submit.sentListing" : "submit.sent", { name: municipality.name }), { label: t("submit.viewMine"), to: "/mypage" });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("submit.error"));
      setSending(false);
    }
  }

  const field = "mt-1 w-full rounded-xl bg-gray-100 px-3 py-2 text-sm text-jz-ink outline-none focus:ring-2 focus:ring-jz-accent/30";
  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[65] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t("submit.title", { name: municipality.name })}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="animate-sheet-in flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white md:rounded-[28px]"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <h2 className="flex-1 text-[15px] font-bold text-jz-ink">{t("submit.title", { name: municipality.name })}</h2>
          <button type="button" onClick={onClose} aria-label={t("reelViewer.closeLabel")} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-relaxed text-gray-600">{t(municipality.listing ? "submit.introListing" : "submit.intro", { name: municipality.name })}</p>
          <label className="block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-center hover:border-jz-accent/40">
            {preview ? (
              isVideo ? (
                <video src={preview} className="mx-auto max-h-64" muted playsInline controls />
              ) : (
                <img src={preview} alt="" className="mx-auto max-h-64 object-contain" />
              )
            ) : (
              <span className="flex flex-col items-center gap-1.5 px-4 py-8 text-xs font-semibold text-gray-500">
                <ImagePlus className="h-7 w-7 text-jz-accent" />
                {t("submit.pick")}
              </span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              className="sr-only"
              aria-label={t("submit.pick")}
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          {file && (
            <p className="flex items-center gap-1 text-[11px] text-gray-500">
              <MapPin className="h-3 w-3" /> {where ? t("submit.hasPlace") : isVideo ? t("submit.videoPlace") : t("submit.noPlace")}
            </p>
          )}
          <label className="block text-[11px] font-semibold text-gray-500">
            {t("submit.descriptionLabel")}
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder={t("submit.descriptionPlaceholder")} className={`${field} resize-none`} />
          </label>
          <label className="block text-[11px] font-semibold text-gray-500">
            {t("submit.placeLabel")}
            <input value={locationName} onChange={(e) => setLocationName(e.target.value)} maxLength={200} placeholder={t("submit.placePlaceholder")} className={field} />
          </label>
          <label className="flex items-start gap-2 rounded-2xl bg-gray-50 px-3 py-2.5 text-xs text-jz-ink">
            <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-jz-accent)]" />
            <span>{t("submit.credit")}</span>
          </label>
          <label className="flex items-start gap-2 rounded-2xl bg-jz-tint px-3 py-2.5 text-xs font-semibold text-jz-ink">
            <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-jz-accent)]" />
            <span>{t(municipality.listing ? "submit.consentListing" : "submit.consent", { name: municipality.name })}</span>
          </label>
          <p className="text-[11px] leading-relaxed text-gray-500">{t("submit.note")}</p>
          {error && <p className="text-xs text-jz-warm-text">{error}</p>}
        </div>
        <div className="border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="submit" disabled={!file || !consent || sending} className="w-full rounded-full bg-jz-accent py-3 text-sm font-bold text-white disabled:opacity-50">
            {sending ? t("submit.sending") : t("submit.send")}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
