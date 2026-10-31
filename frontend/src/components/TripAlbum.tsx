import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ImagePlus, MapPin, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { readExifGps, readExifTakenAt } from "../lib/exifGps";
import { resizeImageToBlob } from "../lib/resizeImage";
import { showToast } from "../lib/toast";
import type { ItineraryStop, TripPhoto } from "../types";

const MAX_SIDE = 1600;

// 旅のアルバム: the trip members' photos, grouped by the stop each was taken
// at — worked out from the original photo's location, read on the device.
// Photos are shrunk before upload (which also strips their metadata) and
// only the trip's members can see them.
export default function TripAlbum({
  tripId,
  stops,
  photos,
  isOwner,
  readOnly = false,
  onChanged,
}: {
  tripId: string;
  stops: ItineraryStop[];
  photos: TripPhoto[];
  isOwner: boolean;
  readOnly?: boolean;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  // Stop order first, then the ones not taken near any stop.
  const groups = [
    ...stops.map((s) => ({ key: s.id, title: s.locationName || s.municipality.name, photos: photos.filter((p) => p.stopReelId === s.id) })),
    { key: "other", title: t("album.other"), photos: photos.filter((p) => !p.stopReelId || !stops.some((s) => s.id === p.stopReelId)) },
  ].filter((g) => g.photos.length > 0);
  const ordered = groups.flatMap((g) => g.photos);

  async function add(files: FileList) {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setProgress({ done: 0, total: list.length });
    let failed = 0;
    for (const [i, file] of list.entries()) {
      try {
        const original = await file.arrayBuffer();
        const where = readExifGps(original);
        const takenAt = readExifTakenAt(original);
        const { blob, width, height } = await resizeImageToBlob(file, MAX_SIDE);
        const form = new FormData();
        form.append("photo", blob, "photo.jpg");
        form.append("width", String(width));
        form.append("height", String(height));
        if (where) {
          form.append("lat", String(where.lat));
          form.append("lng", String(where.lng));
        }
        if (takenAt) form.append("takenAt", takenAt);
        await api.post(`/me/trips/${tripId}/photos`, form);
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setProgress(null);
    showToast(failed > 0 ? t("album.someFailed", { count: failed }) : t("album.added", { count: list.length }));
    onChanged();
  }

  if (readOnly && photos.length === 0) return null;

  return (
    <section className="mt-4 rounded-2xl border border-gray-200 p-3" aria-label={t("album.heading")}>
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-xs font-semibold text-gray-500">
          {t("album.heading")}
          {photos.length > 0 && <span className="ml-1.5 font-normal">{t("album.count", { count: photos.length })}</span>}
        </h3>
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={!!progress}
              className="inline-flex items-center gap-1 rounded-full bg-jz-red px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            >
              <ImagePlus className="h-3.5 w-3.5" /> {progress ? t("album.uploading", progress) : t("album.add")}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              className="sr-only"
              aria-label={t("album.add")}
              onChange={(e) => {
                if (e.target.files) void add(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{t("album.empty")}</p>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="mt-3">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-jz-ink">
              {g.key !== "other" && <MapPin className="h-3 w-3 text-jz-red" />}
              {g.title}
              <span className="font-normal text-gray-500">{t("album.count", { count: g.photos.length })}</span>
            </p>
            <div className="grid grid-cols-3 gap-1">
              {g.photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOpen(ordered.indexOf(p))}
                  aria-label={t("album.open", { name: p.by.name })}
                  className="aspect-square overflow-hidden rounded-lg bg-gray-100"
                >
                  <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition hover:scale-105" />
                </button>
              ))}
            </div>
          </div>
        ))
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-gray-400">{t("album.privacy")}</p>
      {open != null && ordered[open] && (
        <Lightbox
          photos={ordered}
          index={open}
          stopName={(id) => stops.find((s) => s.id === id)?.locationName ?? null}
          canDelete={(p) => !readOnly && (p.isMine || isOwner)}
          lang={i18n.language}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onDelete={async (p) => {
            if (!window.confirm(t("album.deleteConfirm"))) return;
            await api.delete(`/me/trips/${tripId}/photos/${p.id}`);
            setOpen(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function Lightbox({
  photos,
  index,
  stopName,
  canDelete,
  lang,
  onIndex,
  onClose,
  onDelete,
}: {
  photos: TripPhoto[];
  index: number;
  stopName: (id: string | null) => string | null;
  canDelete: (p: TripPhoto) => boolean;
  lang: string;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete: (p: TripPhoto) => void;
}) {
  const { t } = useTranslation();
  const p = photos[index];
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex, onClose]);

  const place = stopName(p.stopReelId);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("album.heading")}
      className="on-media animate-fade-in fixed inset-0 z-[75] flex flex-col bg-black text-white"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (dx < -50 && index < photos.length - 1) onIndex(index + 1);
        if (dx > 50 && index > 0) onIndex(index - 1);
      }}
    >
      <div className="flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label={t("reelViewer.closeLabel")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-bold">{p.by.name}</p>
          <p className="truncate text-xs text-white/70">
            {[place, p.takenAt && new Date(p.takenAt).toLocaleString(lang, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })].filter(Boolean).join("・")}
          </p>
        </div>
        {canDelete(p) && (
          <button type="button" onClick={() => onDelete(p)} aria-label={t("album.delete")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <img key={p.id} src={p.url} alt="" className="animate-fade-in max-h-full max-w-full object-contain" />
        {index > 0 && (
          <button type="button" onClick={() => onIndex(index - 1)} aria-label={t("album.previous")} className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {index < photos.length - 1 && (
          <button type="button" onClick={() => onIndex(index + 1)} aria-label={t("album.next")} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
      <p className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs tabular-nums text-white/60">
        {index + 1} / {photos.length}
      </p>
    </div>,
    document.body
  );
}
