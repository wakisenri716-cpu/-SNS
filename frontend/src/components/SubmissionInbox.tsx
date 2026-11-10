import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PlaceField, { type PlaceValue } from "./PlaceField";
import { Check, Film, MapPin, X } from "lucide-react";
import { api } from "../api/client";
import { showToast } from "../lib/toast";
import { photoToVideo, photoToVideoSupported } from "../lib/photoToVideo";
import { REEL_CATEGORIES, type Reel, type ReelCategory, type Submission } from "../types";
import StatusBadge from "./SubmissionStatusBadge";

const VIEWS = ["pending", "approved", "posted", "rejected"] as const;
type View = (typeof VIEWS)[number];

// 提供された素材, for the municipality: photos and videos travelers offered.
// 承認 gives the traveler points; 見送る (optionally with a reason they'll
// see) doesn't. An approved one can then be posted — a video as sent, a
// photo turned into a short vertical clip on this device first — and the
// post credits the traveler by name if they asked.
// `admin`: the operator's inbox for unofficial (listing) pages, which nobody
// runs (admin site) — same screens, the admin API, posts become Jaziba's
// introductions of the town.
export default function SubmissionInbox({
  onCountsChange,
  onPosted,
  admin = false,
}: {
  onCountsChange?: (pending: number) => void;
  onPosted?: (reel: Reel) => void;
  admin?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<View>("pending");
  const [items, setItems] = useState<Submission[] | null>(null);
  const [counts, setCounts] = useState({ pending: 0, approved: 0 });
  const [points, setPoints] = useState(100);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [posting, setPosting] = useState<Submission | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get<{ items: Submission[]; counts: { pending: number; approved: number }; pointsPerApproval: number }>(admin ? "/admin/submissions" : "/submissions/inbox", { params: { status: view } });
    setItems(data.items);
    setCounts(data.counts);
    setPoints(data.pointsPerApproval);
    onCountsChange?.(data.counts.pending);
  }, [view, onCountsChange, admin]);

  useEffect(() => {
    setItems(null);
    void load().catch(() => setItems([]));
  }, [load]);

  async function approve(s: Submission) {
    await api.post(admin ? `/admin/submissions/${s.id}/approve` : `/submissions/${s.id}/approve`);
    showToast(t("inbox.approved", { name: s.contributor?.name ?? "", points }));
    void load();
  }
  async function reject(e: FormEvent, s: Submission) {
    e.preventDefault();
    await api.post(admin ? `/admin/submissions/${s.id}/reject` : `/submissions/${s.id}/reject`, { note });
    setRejecting(null);
    setNote("");
    void load();
  }

  return (
    <div className="p-3 lg:p-4">
      <p className="mb-3 rounded-2xl bg-jz-tint px-4 py-3 text-xs leading-relaxed text-jz-ink">{t(admin ? "inbox.adminIntro" : "inbox.intro", { points })}</p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${view === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {t(`inbox.view.${v}`)}
            {v === "pending" && counts.pending > 0 && <span className="ml-1 rounded-full bg-jz-warm px-1.5 text-[10px] text-white">{counts.pending}</span>}
            {v === "approved" && counts.approved > 0 && <span className="ml-1 text-[10px]">{counts.approved}</span>}
          </button>
        ))}
      </div>
      {items == null ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500">{t(`inbox.empty.${view}`)}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((s) => (
            <li key={s.id} className="overflow-hidden rounded-2xl border border-gray-200">
              <div className="on-media bg-black">
                {s.kind === "video" ? (
                  <video src={s.fileUrl} controls muted playsInline preload="metadata" className="mx-auto max-h-80 w-full object-contain" />
                ) : (
                  <img src={s.fileUrl} alt={s.description || t("inbox.photoAlt")} loading="lazy" className="mx-auto max-h-80 w-full object-contain" />
                )}
              </div>
              <div className="space-y-1 p-3 text-xs">
                <p className="flex flex-wrap items-center gap-1.5">
                  {admin && s.municipality && (
                    <span className="rounded-full bg-jz-tint px-2 py-0.5 text-[11px] font-bold text-jz-accent">
                      {s.municipality.prefecture}
                      {s.municipality.name}
                    </span>
                  )}
                  <span className="font-bold text-gray-900">{s.contributor?.name}</span>
                  <StatusBadge s={s} />
                  <span className="text-[11px] text-gray-500">{t(s.kind === "video" ? "inbox.video" : "inbox.photo")}</span>
                </p>
                {s.description && <p className="whitespace-pre-wrap text-gray-700">{s.description}</p>}
                {(s.locationName || s.locationLat != null) && (
                  <p className="flex items-center gap-1 text-[11px] text-gray-500">
                    <MapPin className="h-3 w-3" /> {s.locationName || t("inbox.hasCoords")}
                  </p>
                )}
                <p className="text-[11px] text-gray-500">
                  {[
                    t("inbox.sentAt", { date: new Date(s.createdAt).toLocaleDateString(i18n.language) }),
                    s.takenAt && t("inbox.takenAt", { date: new Date(s.takenAt).toLocaleDateString(i18n.language) }),
                    t(s.credit ? "inbox.creditYes" : "inbox.creditNo"),
                  ]
                    .filter(Boolean)
                    .join("・")}
                </p>
                {s.status === "rejected" && s.reviewNote && <p className="text-[11px] text-gray-500">{t("submissions.reason", { note: s.reviewNote })}</p>}

                {s.status === "pending" &&
                  (rejecting === s.id ? (
                    <form onSubmit={(e) => void reject(e, s)} className="mt-2 space-y-1.5">
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder={t("inbox.notePlaceholder")} aria-label={t("inbox.noteLabel")} className="w-full resize-none rounded-xl bg-gray-100 px-3 py-2 text-xs outline-none" />
                      <div className="flex gap-1.5">
                        <button type="submit" className="rounded-full bg-gray-900 px-3 py-1.5 text-[11px] font-bold text-white">
                          {t("inbox.rejectConfirm")}
                        </button>
                        <button type="button" onClick={() => setRejecting(null)} className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-gray-500">
                          {t("dashboard.cancel")}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => void approve(s)} className="inline-flex items-center gap-1 rounded-full bg-jz-accent px-3 py-1.5 text-[11px] font-bold text-white active:scale-95">
                        <Check className="h-3.5 w-3.5" /> {t("inbox.approve", { points })}
                      </button>
                      <button type="button" onClick={() => setRejecting(s.id)} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-700">
                        <X className="h-3.5 w-3.5" /> {t("inbox.reject")}
                      </button>
                    </div>
                  ))}
                {s.status === "approved" && !s.reelId && (
                  <button type="button" onClick={() => setPosting(s)} className="mt-2 inline-flex items-center gap-1 rounded-full bg-jz-accent px-3 py-1.5 text-[11px] font-bold text-white active:scale-95">
                    <Film className="h-3.5 w-3.5" /> {t("inbox.post")}
                  </button>
                )}
                {s.reelId && (
                  <Link to={`/reels/${s.reelId}/access`} className="mt-1 inline-block text-[11px] font-bold text-jz-accent">
                    {t("submissions.viewPost")}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {posting && (
        <PostSheet
          submission={posting}
          admin={admin}
          onClose={() => setPosting(null)}
          onPosted={(reel) => {
            setPosting(null);
            showToast(t(admin ? "inbox.adminPosted" : "inbox.posted"));
            if (reel) onPosted?.(reel);
            void load();
          }}
        />
      )}
    </div>
  );
}

function PostSheet({ submission, admin, onClose, onPosted }: { submission: Submission; admin: boolean; onClose: () => void; onPosted: (reel: Reel | null) => void }) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState(submission.description);
  const [category, setCategory] = useState<ReelCategory>("nature");
  const [place, setPlace] = useState<PlaceValue>({ name: submission.locationName, lat: submission.locationLat ?? null, lng: submission.locationLng ?? null });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPhoto = submission.kind === "photo";
  const canMake = !isPhoto || photoToVideoSupported();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setProgress(0);
    try {
      const form = new FormData();
      if (!admin) form.append("submissionId", submission.id);
      if (isPhoto) form.append("video", await photoToVideo(submission.fileUrl, { onProgress: (p) => setProgress(p) }));
      form.append("caption", caption);
      form.append("category", category);
      if (place.name.trim()) form.append("locationName", place.name.trim());
      if (place.lat != null && place.lng != null) {
        form.append("locationLat", String(place.lat));
        form.append("locationLng", String(place.lng));
      }
      if (admin) {
        // Jaziba's introduction of the town.
        await api.post(`/admin/submissions/${submission.id}/post`, form);
        onPosted(null);
      } else {
        const { data } = await api.post<Reel>("/reels", form);
        onPosted(data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error && typeof err.response.data.error === "string" ? err.response.data.error : t("inbox.postError"));
      setProgress(null);
    }
  }

  const field = "mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400";
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-4" onClick={progress == null ? onClose : undefined}>
      <form role="dialog" aria-modal="true" aria-label={t("inbox.postTitle")} onSubmit={submit} onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-sm font-bold text-gray-900">{t("inbox.postTitle")}</h3>
        <p className="text-[11px] leading-relaxed text-gray-500">
          {submission.credit ? t("inbox.postCredit", { name: submission.contributor?.name ?? "" }) : t("inbox.postAnonymous")}
          {isPhoto && ` ${t("inbox.photoNote")}`}
        </p>
        <label className="text-xs font-medium text-gray-500">
          {t("reelEditor.captionLabel")}
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} maxLength={2000} className={field} />
        </label>
        <label className="text-xs font-medium text-gray-500">
          {t("reelUploader.categoryLabel")}
          <select value={category} onChange={(e) => setCategory(e.target.value as ReelCategory)} className={field}>
            {REEL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <PlaceField
          value={place}
          onChange={setPlace}
          municipalityId={submission.municipality?.id}
          label={t("reelEditor.locationLabel")}
          inputClassName={field.replace("mt-1 w-full ", "")}
        />
        {progress != null && isPhoto && (
          <div aria-live="polite">
            <p className="text-[11px] font-semibold text-gray-700">{progress < 1 ? t("inbox.making", { percent: Math.round(progress * 100) }) : t("inbox.uploading")}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-jz-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}
        {!canMake && <p className="text-xs text-jz-warm-text">{t("inbox.cantMake")}</p>}
        {error && <p className="text-xs text-jz-warm-text">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={progress != null} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            {t("dashboard.cancel")}
          </button>
          <button type="submit" disabled={progress != null || !canMake} className="rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {t("inbox.postButton")}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
