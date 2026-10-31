import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink, Pencil, Plus, Radio, Ticket, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { showToast } from "../lib/toast";
import { statusUrl } from "../lib/transitLinks";
import { KIND_ICON, clock } from "../lib/transportDisplay";
import { isoToLocalInput, localInputToIso, splitDuration, transportPhase } from "../lib/transportTiming";
import type { TripTransport } from "../types";

const TransitModeView = lazy(() => import("./TransitModeView"));

const KINDS = ["plane", "train", "bus", "ferry", "other"] as const;

// 乗る便: the flights, trains and buses the travellers booked, entered by
// them, in departure order — with a countdown when one is close, its status
// page, and 移動中モード. Members add and edit; a shared link only reads.
export default function TripTransports({
  tripId,
  startDate,
  transports,
  onChanged,
  readOnly = false,
}: {
  tripId: string;
  startDate: string | null;
  transports: TripTransport[];
  onChanged?: () => void;
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<TripTransport | "new" | null>(null);
  const [riding, setRiding] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function remove(tr: TripTransport) {
    if (!window.confirm(t("transport.removeConfirm", { name: tr.name }))) return;
    await api.delete(`/me/trips/${tripId}/transports/${tr.id}`);
    onChanged?.();
  }

  if (readOnly && transports.length === 0) return null;

  return (
    <section className="mb-4" aria-label={t("transport.heading")}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-xs font-semibold text-gray-500">{t("transport.heading")}</h3>
        {!readOnly && (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-jz-ink">
            <Plus className="h-3.5 w-3.5" /> {t("transport.add")}
          </button>
        )}
      </div>
      {transports.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-3 text-[11px] leading-relaxed text-gray-500">{t("transport.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {transports.map((tr) => {
            const Icon = KIND_ICON[tr.kind] ?? Ticket;
            const { phase, toDepartMs } = transportPhase(tr, now);
            const left = splitDuration(toDepartMs);
            return (
              <li key={tr.id} className={`rounded-2xl border p-3 ${phase === "enroute" || phase === "soon" ? "border-jz-red/40 bg-jz-tint" : "border-gray-200"}`}>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-jz-ink text-white">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-jz-ink">
                      {tr.name}
                      {tr.operator && <span className="ml-1.5 text-[11px] font-normal text-gray-500">{tr.operator}</span>}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-jz-ink">
                      {new Date(tr.departAt).toLocaleDateString(i18n.language, { month: "numeric", day: "numeric", weekday: "short" })}{" "}
                      <b>{clock(tr.departAt, i18n.language)}</b> {tr.fromName} → <b>{clock(tr.arriveAt, i18n.language)}</b> {tr.toName}
                    </p>
                    {(tr.departPlatform || tr.seat) && (
                      <p className="mt-1 flex flex-wrap gap-1 text-[11px]">
                        {tr.departPlatform && <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-jz-ink ring-1 ring-gray-200">{tr.departPlatform}</span>}
                        {tr.seat && <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-jz-ink ring-1 ring-gray-200">{t("transport.seatValue", { seat: tr.seat })}</span>}
                      </p>
                    )}
                    {(phase === "soon" || phase === "enroute") && (
                      <p className="mt-1 text-[11px] font-bold text-jz-red">
                        {phase === "soon" ? t("transport.departsIn", { minutes: left.h * 60 + left.m }) : t("transport.enroute")}
                      </p>
                    )}
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => setEditing(tr)} aria-label={t("transport.edit", { name: tr.name })} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-jz-ink">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void remove(tr)} aria-label={t("transport.remove", { name: tr.name })} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-jz-red">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setRiding(tr.id)} className="inline-flex items-center gap-1 rounded-full bg-jz-red px-3 py-1 text-[11px] font-bold text-white active:scale-95">
                    <Radio className="h-3.5 w-3.5" /> {t("transport.rideMode")}
                  </button>
                  <a href={statusUrl(tr.kind, tr.name, tr.operator)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-jz-ink hover:bg-gray-200">
                    {t("transport.status")} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <TransportForm
          tripId={tripId}
          startDate={startDate}
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged?.();
          }}
        />
      )}
      {riding && (
        <Suspense fallback={null}>
          <TransitModeView transports={transports} startId={riding} onClose={() => setRiding(null)} />
        </Suspense>
      )}
    </section>
  );
}

function TransportForm({
  tripId,
  startDate,
  existing,
  onClose,
  onSaved,
}: {
  tripId: string;
  startDate: string | null;
  existing: TripTransport | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const day = startDate ?? isoToLocalInput(new Date().toISOString()).slice(0, 10);
  const [form, setForm] = useState({
    kind: existing?.kind ?? ("train" as TripTransport["kind"]),
    name: existing?.name ?? "",
    operator: existing?.operator ?? "",
    fromName: existing?.fromName ?? "",
    toName: existing?.toName ?? "",
    departAt: existing ? isoToLocalInput(existing.departAt) : `${day}T09:00`,
    arriveAt: existing ? isoToLocalInput(existing.arriveAt) : `${day}T10:00`,
    departPlatform: existing?.departPlatform ?? "",
    arrivePlatform: existing?.arrivePlatform ?? "",
    seat: existing?.seat ?? "",
    confirmation: existing?.confirmation ?? "",
    note: existing?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = { ...form, departAt: localInputToIso(form.departAt), arriveAt: localInputToIso(form.arriveAt) };
    try {
      if (existing) await api.put(`/me/trips/${tripId}/transports/${existing.id}`, body);
      else await api.post(`/me/trips/${tripId}/transports`, body);
      showToast(t("transport.saved"));
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("transport.error"));
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded-xl bg-gray-100 px-3 py-2 text-sm text-jz-ink outline-none focus:ring-2 focus:ring-jz-red/30";
  const label = "block text-[11px] font-semibold text-gray-500";
  const placeholders = { plane: "JL123", train: t("transport.trainExample"), bus: t("transport.busExample"), ferry: "", other: "" };

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[65] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={existing ? t("transport.editTitle") : t("transport.addTitle")}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="animate-sheet-in flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white md:rounded-[28px]"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <h2 className="flex-1 text-[15px] font-bold text-jz-ink">{existing ? t("transport.editTitle") : t("transport.addTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("reelViewer.closeLabel")} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("transport.kindLabel")}>
            {KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === k}
                  onClick={() => setForm((f) => ({ ...f, kind: k }))}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${form.kind === k ? "bg-jz-ink text-white" : "bg-gray-100 text-jz-ink"}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {t(`transport.kind.${k}`)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("transport.nameLabel")}
              <input required value={form.name} onChange={set("name")} maxLength={60} placeholder={placeholders[form.kind]} className={field} />
            </label>
            <label className={label}>
              {t("transport.operatorLabel")}
              <input value={form.operator} onChange={set("operator")} maxLength={60} className={field} />
            </label>
            <label className={label}>
              {t("transport.fromLabel")}
              <input required value={form.fromName} onChange={set("fromName")} maxLength={60} className={field} />
            </label>
            <label className={label}>
              {t("transport.toLabel")}
              <input required value={form.toName} onChange={set("toName")} maxLength={60} className={field} />
            </label>
            <label className={label}>
              {t("transport.departLabel")}
              <input required type="datetime-local" value={form.departAt} onChange={set("departAt")} className={field} />
            </label>
            <label className={label}>
              {t("transport.arriveLabel")}
              <input required type="datetime-local" value={form.arriveAt} onChange={set("arriveAt")} className={field} />
            </label>
            <label className={label}>
              {t(`transport.departPlatformLabel.${form.kind}`)}
              <input value={form.departPlatform} onChange={set("departPlatform")} maxLength={30} className={field} />
            </label>
            <label className={label}>
              {t(`transport.arrivePlatformLabel.${form.kind}`)}
              <input value={form.arrivePlatform} onChange={set("arrivePlatform")} maxLength={30} className={field} />
            </label>
            <label className={label}>
              {t("transport.seatLabel")}
              <input value={form.seat} onChange={set("seat")} maxLength={30} className={field} />
            </label>
            <label className={label}>
              {t("transport.confirmationLabel")}
              <input value={form.confirmation} onChange={set("confirmation")} maxLength={40} className={field} />
            </label>
          </div>
          <label className={label}>
            {t("transport.noteLabel")}
            <textarea value={form.note} onChange={set("note")} maxLength={300} rows={2} className={`${field} resize-none`} />
          </label>
          <p className="text-[11px] leading-relaxed text-gray-500">{t("transport.formNote")}</p>
          {error && <p className="text-xs text-jz-red">{error}</p>}
        </div>
        <div className="border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="submit" disabled={saving} className="w-full rounded-full bg-jz-red py-3 text-sm font-bold text-white disabled:opacity-60">
            {t("transport.save")}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
