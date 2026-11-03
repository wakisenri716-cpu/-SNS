import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BusFront, FileText, ImageIcon, Loader2, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { api } from "../api/client";
import { aiLimitOf } from "../lib/aiLimit";
import { showToast } from "../lib/toast";
import AiLimitNotice from "./AiLimitNotice";
import type { LocalTransit, Reel } from "../types";

type Draft = { title: string; body: string; reelId: string; sourceUrl: string; validUntil: string };
const empty: Draft = { title: "", body: "", reelId: "", sourceUrl: "", validUntil: "" };
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

// 地元の交通情報, for a municipality or a business: add the transport
// information that's on your own site or leaflet — upload the screenshot or
// PDF, let the AI draft the key points (or write them), check, publish. It
// shows on the access pages of one spot, or of all your spots.
export default function LocalTransitManager({ reels }: { reels: Reel[] }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<LocalTransit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<{ signedIn: boolean; plan: string | null } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () =>
    api
      .get<{ items: LocalTransit[] }>("/local-transit/mine")
      .then(({ data }) => setItems(data.items))
      .catch(() => setItems([]));
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!file || file.type === "application/pdf") return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setOpen(false);
    setEditing(null);
    setDraft(empty);
    setFile(null);
    setAiDrafted(false);
    setError(null);
    setLimit(null);
  }

  async function readWithAi() {
    if (!file) return;
    setReading(true);
    setError(null);
    setLimit(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post<{ title: string; body: string; validUntil: string | null }>("/local-transit/read", form);
      setDraft((d) => ({ ...d, title: data.title || d.title, body: data.body, validUntil: data.validUntil ?? d.validUntil }));
      setAiDrafted(true);
    } catch (err: any) {
      const l = aiLimitOf(err);
      if (l) setLimit(l);
      else setError(err?.response?.data?.error ?? t("localTransit.readError"));
    } finally {
      setReading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.put(`/local-transit/${editing}`, { ...draft, reelId: draft.reelId || null, validUntil: draft.validUntil || null });
      } else {
        const form = new FormData();
        for (const [k, v] of Object.entries(draft)) form.append(k, v);
        form.append("aiDrafted", String(aiDrafted));
        if (file) form.append("file", file);
        await api.post("/local-transit", form);
      }
      showToast(t(editing ? "localTransit.saved" : "localTransit.published"));
      reset();
      void load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("localTransit.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: LocalTransit) {
    if (!window.confirm(t("localTransit.deleteConfirm", { title: item.title }))) return;
    await api.delete(`/local-transit/${item.id}`).catch(() => showToast(t("localTransit.saveError")));
    void load();
  }

  function edit(item: LocalTransit) {
    setEditing(item.id);
    setOpen(true);
    setFile(null);
    setDraft({ title: item.title, body: item.body, reelId: item.reel?.id ?? "", sourceUrl: item.sourceUrl ?? "", validUntil: item.validUntil ?? "" });
  }

  const field = "mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400";
  const label = "block text-xs font-medium text-gray-500";
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const spots = reels.filter((r) => r.locationName);

  return (
    <section className="space-y-3 p-3 lg:p-4" aria-labelledby="local-transit-manage">
      <div className="flex items-center justify-between gap-2">
        <h3 id="local-transit-manage" className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <BusFront className="h-4 w-4 text-jz-accent" /> {t("localTransit.manageHeading")}
        </h3>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-full bg-jz-accent px-3 py-1.5 text-xs font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> {t("localTransit.add")}
          </button>
        )}
      </div>
      <p className="rounded-2xl bg-jz-tint px-4 py-3 text-xs leading-relaxed text-jz-ink">{t("localTransit.manageIntro")}</p>

      {open && (
        <form onSubmit={save} className="space-y-3 rounded-2xl border border-gray-200 p-3">
          {!editing && (
            <div>
              <span className={label}>{t("localTransit.fileLabel")}</span>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                aria-label={t("localTransit.fileLabel")}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setAiDrafted(false);
                  e.target.value = "";
                }}
              />
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-2 text-xs font-bold text-gray-800 hover:bg-gray-200"
                >
                  <Upload className="h-3.5 w-3.5" /> {file ? t("localTransit.changeFile") : t("localTransit.chooseFile")}
                </button>
                {file && (
                  <button
                    type="button"
                    onClick={() => void readWithAi()}
                    disabled={reading}
                    className="ai-border inline-flex rounded-full p-[1.5px] disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-[7px] text-xs font-bold text-jz-ink">
                      {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-jz-accent" /> : <Sparkles className="h-3.5 w-3.5 text-jz-accent" />}
                      {reading ? t("localTransit.reading") : t("localTransit.readWithAi")}
                    </span>
                  </button>
                )}
              </div>
              {file && (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-gray-50 p-2 text-xs text-gray-700">
                  {preview ? (
                    <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white">
                      {file.type === "application/pdf" ? <FileText className="h-6 w-6 text-jz-warm" /> : <ImageIcon className="h-6 w-6" />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                </div>
              )}
              <p className="mt-1 text-[11px] text-gray-500">{t("localTransit.fileHint")}</p>
            </div>
          )}
          {limit && <AiLimitNotice signedIn={limit.signedIn} plan={limit.plan} />}
          {aiDrafted && <p className="rounded-xl bg-amber-50 p-2.5 text-[11px] font-semibold leading-relaxed text-amber-800">{t("localTransit.checkAi")}</p>}

          <label className={label}>
            {t("localTransit.titleLabel")}
            <input value={draft.title} onChange={set("title")} required maxLength={80} placeholder={t("localTransit.titlePlaceholder")} className={field} />
          </label>
          <label className={label}>
            {t("localTransit.bodyLabel")}
            <textarea value={draft.body} onChange={set("body")} rows={8} maxLength={3000} placeholder={t("localTransit.bodyPlaceholder")} className={`${field} leading-relaxed`} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              {t("localTransit.spotLabel")}
              <select value={draft.reelId} onChange={set("reelId")} className={field}>
                <option value="">{t("localTransit.allSpots")}</option>
                {spots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.locationName}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {t("localTransit.validUntilLabel")}
              <input type="date" value={draft.validUntil} onChange={set("validUntil")} className={field} />
            </label>
          </div>
          <label className={label}>
            {t("localTransit.sourceLabel")}
            <input type="url" value={draft.sourceUrl} onChange={set("sourceUrl")} placeholder="https://" className={field} />
          </label>
          {error && <p className="text-xs text-jz-warm-text">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
              {t("dashboard.cancel")}
            </button>
            <button type="submit" disabled={saving || reading || !draft.title.trim() || (!draft.body.trim() && !file && !editing)} className="rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {editing ? t("localTransit.save") : t("localTransit.publish")}
            </button>
          </div>
        </form>
      )}

      {items == null ? (
        <div className="skeleton h-20 rounded-2xl" />
      ) : items.length === 0 ? (
        !open && <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500">{t("localTransit.none")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-2xl border border-gray-200 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-jz-tint text-jz-accent">
                {item.fileKind === "pdf" ? <FileText className="h-5 w-5" /> : item.fileKind === "image" ? <ImageIcon className="h-5 w-5" /> : <BusFront className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-jz-ink">{item.title}</p>
                <p className="text-[11px] text-gray-500">
                  {item.reel?.locationName ?? t("localTransit.allSpots")}
                  {item.validUntil && `・${t("localTransit.until", { date: item.validUntil.replace(/-/g, "/") })}`}
                </p>
              </div>
              <button type="button" onClick={() => edit(item)} aria-label={t("localTransit.edit")} className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void remove(item)} aria-label={t("localTransit.delete")} className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
