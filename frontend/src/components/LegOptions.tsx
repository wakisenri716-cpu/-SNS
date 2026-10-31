import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { showToast } from "../lib/toast";
import { LEG_MODES, RIDE_MODES, optionMinutes } from "../lib/legOptions";
import { rideDateTimes } from "../lib/transitPaste";
import { isoToLocalInput, localInputToIso } from "../lib/transportTiming";
import { clock } from "../lib/transportDisplay";
import { useDuration } from "../lib/useDuration";
import type { LegMode, LegOption, TripTransport } from "../types";
import ModeIcon from "./ModeIcon";
import PasteRoute from "./PasteRoute";

export interface LegInfo {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  /** Planned departure from the しおり, as a datetime-local value. */
  departLocal: string;
  /** The estimate shown for the leg, in minutes. */
  estimateMin: number;
}

// 区間の行き方: the ways the travellers wrote down for one leg — train, bus,
// car, taxi, walk, … — each with its time, fare, note and (for trains,
// buses, flights, boats) its rides. "これで行く" marks the one they'll take;
// its time replaces the estimate in the しおり. Read-only on a shared link.
export default function LegOptions({
  tripId,
  leg,
  options,
  readOnly = false,
  onChanged,
  className = "ml-9",
}: {
  tripId: string;
  leg: LegInfo;
  options: LegOption[];
  readOnly?: boolean;
  onChanged?: () => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const duration = useDuration();
  const [editing, setEditing] = useState<LegOption | "new" | null>(null);
  const shown = readOnly ? options.filter((o) => o.chosen) : options;

  async function choose(o: LegOption) {
    await api.put(`/me/trips/${tripId}/leg-options/${o.id}/chosen`, { chosen: !o.chosen });
    onChanged?.();
  }
  async function remove(o: LegOption) {
    if (!window.confirm(t("legOption.removeConfirm"))) return;
    await api.delete(`/me/trips/${tripId}/leg-options/${o.id}`);
    onChanged?.();
  }

  if (readOnly && shown.length === 0) return null;
  return (
    <div className={className}>
      {shown.length > 0 && (
        <ul className="mb-1 space-y-1.5" aria-label={t("legOption.heading", { from: leg.fromName, to: leg.toName })}>
          {shown.map((o) => {
            const min = optionMinutes(o);
            return (
              <li key={o.id} className={`rounded-2xl border p-2.5 ${o.chosen ? "border-jz-red/50 bg-jz-tint" : "border-gray-200 bg-white"}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${o.chosen ? "bg-jz-red text-white" : "bg-gray-100 text-jz-ink"}`}>
                    <ModeIcon mode={o.mode} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-jz-ink">
                      {t(`legOption.mode.${o.mode}`)}
                      {o.title && <span className="ml-1.5 font-semibold">{o.title}</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-gray-600">
                      {[min != null && duration(min), o.fareYen != null && t("legOption.fare", { yen: o.fareYen.toLocaleString(i18n.language) })].filter(Boolean).join("・") ||
                        t("legOption.noDetails")}
                    </p>
                    {o.rides.map((r) => (
                      <p key={r.id} className="mt-0.5 truncate text-[11px] tabular-nums text-jz-ink">
                        <b>{clock(r.departAt, i18n.language)}</b> {r.fromName} → <b>{clock(r.arriveAt, i18n.language)}</b> {r.toName}
                        <span className="ml-1 text-gray-500">{[r.name, r.departPlatform].filter(Boolean).join("・")}</span>
                      </p>
                    ))}
                    {o.note && <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-gray-500">{o.note}</p>}
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => setEditing(o)} aria-label={t("legOption.edit")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-jz-ink">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void remove(o)} aria-label={t("legOption.remove")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-jz-red">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => void choose(o)}
                    aria-pressed={o.chosen}
                    className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold active:scale-95 ${
                      o.chosen ? "bg-jz-red text-white" : "bg-white text-jz-ink ring-1 ring-gray-300"
                    }`}
                  >
                    {o.chosen && <Check className="h-3.5 w-3.5" />}
                    {o.chosen ? t("legOption.chosen") : t("legOption.choose")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-jz-ink hover:bg-gray-200"
        >
          <Plus className="h-3.5 w-3.5" /> {options.length === 0 ? t("legOption.addFirst") : t("legOption.addAnother")}
        </button>
      )}
      {editing && (
        <LegOptionForm
          tripId={tripId}
          leg={leg}
          existing={editing === "new" ? null : editing}
          chooseByDefault={!options.some((o) => o.chosen)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

type RideRow = Omit<TripTransport, "id" | "departAt" | "arriveAt"> & { id?: string; key: string; departAt: string; arriveAt: string };

let rowKey = 0;
const newKey = () => `r${++rowKey}`;
const rideKind = (mode: LegMode): TripTransport["kind"] => (mode === "train" || mode === "bus" || mode === "plane" || mode === "ferry" ? mode : "other");

function LegOptionForm({
  tripId,
  leg,
  existing,
  chooseByDefault,
  onClose,
  onSaved,
}: {
  tripId: string;
  leg: LegInfo;
  existing: LegOption | null;
  chooseByDefault: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const duration = useDuration();
  const [mode, setMode] = useState<LegMode>(existing?.mode ?? "train");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [minutes, setMinutes] = useState(existing?.durationMin != null ? String(existing.durationMin) : "");
  const [fare, setFare] = useState(existing?.fareYen != null ? String(existing.fareYen) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [chosen, setChosen] = useState(existing ? existing.chosen : chooseByDefault);
  const [rides, setRides] = useState<RideRow[]>(
    () => existing?.rides.map((r) => ({ ...r, key: newKey(), departAt: isoToLocalInput(r.departAt), arriveAt: isoToLocalInput(r.arriveAt) })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasRides = RIDE_MODES.includes(mode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const blankRide = (after?: RideRow): RideRow => {
    const depart = after?.arriveAt ?? leg.departLocal;
    const end = new Date(new Date(depart).getTime() + leg.estimateMin * 60_000).toISOString();
    return {
      key: newKey(),
      kind: rideKind(mode),
      name: "",
      operator: "",
      fromName: after?.toName ?? leg.fromName.slice(0, 60),
      toName: leg.toName.slice(0, 60),
      departAt: depart,
      arriveAt: isoToLocalInput(end),
      departPlatform: "",
      arrivePlatform: "",
      seat: "",
      confirmation: "",
      note: "",
    };
  };
  const setRide = (key: string, patch: Partial<RideRow>) => setRides((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Time from the rides entered, shown when no time is written.
  const fromRides =
    rides.length > 0 && rides.every((r) => r.departAt && r.arriveAt)
      ? optionMinutes({ durationMin: null, rides: rides.map((r) => ({ departAt: new Date(r.departAt).toISOString(), arriveAt: new Date(r.arriveAt).toISOString() })) })
      : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      fromId: leg.fromId,
      toId: leg.toId,
      mode,
      title,
      durationMin: minutes.trim() === "" ? null : Number(minutes),
      fareYen: fare.trim() === "" ? null : Number(fare.replace(/[,，円\s]/g, "")),
      note,
      chosen,
      rides: hasRides
        ? rides.map(({ key: _key, optionId: _optionId, ...r }) => ({
            ...r,
            name: r.name.trim() || t(`legOption.mode.${mode}`),
            departAt: localInputToIso(r.departAt),
            arriveAt: localInputToIso(r.arriveAt),
          }))
        : [],
    };
    try {
      if (existing) await api.put(`/me/trips/${tripId}/leg-options/${existing.id}`, body);
      else await api.post(`/me/trips/${tripId}/leg-options`, body);
      showToast(t("legOption.saved"));
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("transport.error"));
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded-xl bg-gray-100 px-3 py-2 text-sm text-jz-ink outline-none focus:ring-2 focus:ring-jz-red/30";
  const small = "mt-0.5 w-full rounded-lg bg-white px-2 py-1.5 text-xs text-jz-ink outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-jz-red/30";
  const label = "block text-[11px] font-semibold text-gray-500";
  const heading = existing ? t("legOption.editTitle") : t("legOption.addTitle");

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[65] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="animate-sheet-in flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white md:rounded-[28px]"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-jz-ink">{heading}</h2>
            <p className="truncate text-[11px] text-gray-500">
              {leg.fromName} → {leg.toName}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("reelViewer.closeLabel")} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("legOption.modeLabel")}>
            {LEG_MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  setMode(m);
                  setRides((list) => list.map((r) => ({ ...r, kind: rideKind(m) })));
                }}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${mode === m ? "bg-jz-ink text-white" : "bg-gray-100 text-jz-ink"}`}
              >
                <ModeIcon mode={m} className="h-3.5 w-3.5" /> {t(`legOption.mode.${m}`)}
              </button>
            ))}
          </div>
          <label className={label}>
            {t("legOption.titleLabel")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={t(`legOption.titlePlaceholder.${mode}`)} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("legOption.minutesLabel")}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={4320}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder={fromRides != null ? duration(fromRides) : t("legOption.estimatePlaceholder", { duration: duration(leg.estimateMin) })}
                className={field}
              />
            </label>
            <label className={label}>
              {t("legOption.fareLabel")}
              <input type="text" inputMode="numeric" value={fare} onChange={(e) => setFare(e.target.value)} maxLength={10} placeholder="2,500" className={field} />
            </label>
          </div>
          {fromRides != null && minutes.trim() === "" && <p className="-mt-1 text-[11px] text-gray-500">{t("legOption.minutesFromRides", { duration: duration(fromRides) })}</p>}

          {hasRides && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-500">{t("legOption.ridesLabel")}</p>
              <PasteRoute
                day={(rides[0]?.departAt || leg.departLocal).slice(0, 10)}
                showRides={false}
                onRead={(route) => {
                  const date = route.date ?? (rides[0]?.departAt || leg.departLocal).slice(0, 10);
                  const times = rideDateTimes(date, route.rides);
                  setRides(
                    route.rides.map((r, i) => ({
                      ...blankRide(),
                      kind: r.kind,
                      name: r.name,
                      fromName: r.fromName || (i === 0 ? leg.fromName.slice(0, 60) : ""),
                      toName: r.toName || (i === route.rides.length - 1 ? leg.toName.slice(0, 60) : ""),
                      departAt: times[i].departAt,
                      arriveAt: times[i].arriveAt,
                      departPlatform: r.departPlatform,
                      arrivePlatform: r.arrivePlatform,
                    }))
                  );
                  const first = route.rides[0];
                  if (first && RIDE_MODES.includes(first.kind) && route.rides.every((r) => r.kind === first.kind)) setMode(first.kind as LegMode);
                  if (!title.trim()) setTitle(route.rides.map((r) => r.name).filter(Boolean).join("＋").slice(0, 60));
                }}
              />
              {rides.map((r, i) => (
                <fieldset key={r.key} className="rounded-2xl border border-gray-200 p-2.5">
                  <legend className="px-1 text-[11px] font-bold text-jz-ink">{t("legOption.rideN", { n: i + 1 })}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`${label} col-span-2`}>
                      {t("transport.nameLabel")}
                      <input value={r.name} onChange={(e) => setRide(r.key, { name: e.target.value })} maxLength={60} placeholder={t("transport.trainExample")} className={small} />
                    </label>
                    <label className={label}>
                      {t("transport.fromLabel")}
                      <input required value={r.fromName} onChange={(e) => setRide(r.key, { fromName: e.target.value })} maxLength={60} className={small} />
                    </label>
                    <label className={label}>
                      {t("transport.toLabel")}
                      <input required value={r.toName} onChange={(e) => setRide(r.key, { toName: e.target.value })} maxLength={60} className={small} />
                    </label>
                    <label className={label}>
                      {t("transport.departLabel")}
                      <input required type="datetime-local" value={r.departAt} onChange={(e) => setRide(r.key, { departAt: e.target.value })} className={small} />
                    </label>
                    <label className={label}>
                      {t("transport.arriveLabel")}
                      <input required type="datetime-local" value={r.arriveAt} onChange={(e) => setRide(r.key, { arriveAt: e.target.value })} className={small} />
                    </label>
                    <label className={label}>
                      {t(`transport.departPlatformLabel.${r.kind}`)}
                      <input value={r.departPlatform} onChange={(e) => setRide(r.key, { departPlatform: e.target.value })} maxLength={30} className={small} />
                    </label>
                    <label className={label}>
                      {t(`transport.arrivePlatformLabel.${r.kind}`)}
                      <input value={r.arrivePlatform} onChange={(e) => setRide(r.key, { arrivePlatform: e.target.value })} maxLength={30} className={small} />
                    </label>
                  </div>
                  <button type="button" onClick={() => setRides((list) => list.filter((x) => x.key !== r.key))} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-jz-red">
                    <Trash2 className="h-3 w-3" /> {t("legOption.removeRide")}
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                disabled={rides.length >= 10}
                onClick={() => setRides((list) => [...list, blankRide(list.at(-1))])}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-jz-ink disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> {t("legOption.addRide")}
              </button>
              <p className="text-[11px] leading-relaxed text-gray-500">{t("legOption.ridesNote")}</p>
            </div>
          )}

          <label className={label}>
            {t("transport.noteLabel")}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder={t("legOption.notePlaceholder")} className={`${field} resize-none`} />
          </label>
          <label className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2.5 text-sm font-semibold text-jz-ink">
            <input type="checkbox" checked={chosen} onChange={(e) => setChosen(e.target.checked)} className="h-4 w-4 accent-[var(--color-jz-red)]" />
            {t("legOption.chooseThis")}
          </label>
          <p className="text-[11px] leading-relaxed text-gray-500">{t("legOption.chooseNote")}</p>
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

