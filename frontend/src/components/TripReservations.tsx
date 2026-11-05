import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BedDouble, CalendarCheck, ClipboardPaste, Copy, ExternalLink, Loader2, MapPin, Pencil, Phone, Plus, Sparkles, Ticket, Trash2, UtensilsCrossed, X } from "lucide-react";
import { api } from "../api/client";
import { aiLimitOf } from "../lib/aiLimit";
import { guessReservation, type ReservationGuess } from "../lib/reservationPaste";
import { isoToLocalInput, localInputToIso } from "../lib/transportTiming";
import { showToast } from "../lib/toast";
import AiLimitNotice from "./AiLimitNotice";
import type { ItineraryStop, TripReservation } from "../types";

const KINDS = ["lodging", "restaurant", "activity", "other"] as const;
const ICON = { lodging: BedDouble, restaurant: UtensilsCrossed, activity: Ticket, other: CalendarCheck };

// 予約明細: the bookings the travellers made (a place to stay, a restaurant,
// an activity) in the しおり — typed in, or read from the confirmation email
// (on the device first, then the AI if asked). Booking numbers, prices and
// the booking page are for members; a shared link shows what, where and when.
export default function TripReservations({
  tripId,
  reservations,
  stops = [],
  onChanged,
  readOnly = false,
}: {
  tripId: string;
  reservations: TripReservation[];
  stops?: ItineraryStop[];
  onChanged?: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<TripReservation | "new" | null>(null);

  async function remove(r: TripReservation) {
    if (!window.confirm(t("reservation.removeConfirm", { name: r.name }))) return;
    await api.delete(`/me/trips/${tripId}/reservations/${r.id}`);
    onChanged?.();
  }

  if (readOnly && reservations.length === 0) return null;
  return (
    <section className="mb-4" aria-label={t("reservation.heading")}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-xs font-semibold text-gray-500">{t("reservation.heading")}</h3>
        {!readOnly && (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-jz-ink">
            <Plus className="h-3.5 w-3.5" /> {t("reservation.add")}
          </button>
        )}
      </div>
      {reservations.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="w-full rounded-2xl border border-dashed border-gray-200 p-3 text-left text-[11px] leading-relaxed text-gray-500 hover:bg-gray-50"
        >
          {t("reservation.empty")}
        </button>
      ) : (
        <ul className="space-y-2">
          {reservations.map((r) => (
            <ReservationCard key={r.id} r={r} readOnly={readOnly} onEdit={() => setEditing(r)} onRemove={() => void remove(r)} />
          ))}
        </ul>
      )}
      {editing && (
        <ReservationEditor
          tripId={tripId}
          stops={stops}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

function ReservationCard({ r, readOnly, onEdit, onRemove }: { r: TripReservation; readOnly: boolean; onEdit: () => void; onRemove: () => void }) {
  const { t, i18n } = useTranslation();
  const Icon = ICON[r.kind] ?? CalendarCheck;
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language, { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
  const nights = r.endAt ? Math.round((new Date(r.endAt).setHours(0, 0, 0, 0) - new Date(r.startAt).setHours(0, 0, 0, 0)) / 86_400_000) : 0;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.name, r.address].filter(Boolean).join(" "))}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(r.confirmation);
      showToast(t("reservation.copied"));
    } catch {
      /* the number is on screen anyway */
    }
  }
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-jz-tint text-jz-accent">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-jz-ink">{r.name}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600">
            {r.kind === "lodging" && r.endAt
              ? t("reservation.stayRange", { from: when(r.startAt), to: when(r.endAt), nights })
              : when(r.startAt)}
          </p>
          <p className="text-[11px] text-gray-500">
            {[r.planName, r.guests ? t("reservation.guestsValue", { count: r.guests }) : "", r.priceYen != null ? `¥${r.priceYen.toLocaleString(i18n.language)}` : "", r.payment ? t(`reservation.payment.${r.payment}`) : "", r.bookedVia]
              .filter(Boolean)
              .join("・")}
          </p>
        </div>
        {!readOnly && (
          <div className="flex shrink-0">
            <button type="button" onClick={onEdit} aria-label={t("reservation.edit")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" onClick={onRemove} aria-label={t("reservation.remove")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {r.confirmation && (
        <button type="button" onClick={() => void copy()} className="mt-2 flex w-full items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-left">
          <span className="text-[10px] font-semibold text-gray-500">{t("reservation.confirmation")}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-sm font-bold tracking-wide text-jz-ink">{r.confirmation}</span>
          <Copy className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        </button>
      )}
      {r.note && <p className="mt-2 whitespace-pre-wrap text-[11px] text-gray-600">{r.note}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-jz-ink">
          <MapPin className="h-3 w-3" /> {t("reservation.map")}
        </a>
        {r.phone && (
          <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-jz-ink">
            <Phone className="h-3 w-3" /> {r.phone}
          </a>
        )}
        {r.url && (
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-jz-ink">
            <ExternalLink className="h-3 w-3" /> {t("reservation.openBooking")}
          </a>
        )}
      </div>
    </li>
  );
}

type Draft = {
  kind: TripReservation["kind"];
  name: string;
  reelId: string;
  start: string;
  end: string;
  address: string;
  phone: string;
  confirmation: string;
  guests: string;
  planName: string;
  priceYen: string;
  payment: TripReservation["payment"];
  bookedVia: string;
  url: string;
  note: string;
};

const fromReservation = (r: TripReservation | null): Draft => ({
  kind: r?.kind ?? "lodging",
  name: r?.name ?? "",
  reelId: r?.reelId ?? "",
  start: r ? isoToLocalInput(r.startAt) : "",
  end: r?.endAt ? isoToLocalInput(r.endAt) : "",
  address: r?.address ?? "",
  phone: r?.phone ?? "",
  confirmation: r?.confirmation ?? "",
  guests: r?.guests != null ? String(r.guests) : "",
  planName: r?.planName ?? "",
  priceYen: r?.priceYen != null ? String(r.priceYen) : "",
  payment: r?.payment ?? "",
  bookedVia: r?.bookedVia ?? "",
  url: r?.url ?? "",
  note: r?.note ?? "",
});

function ReservationEditor({ tripId, stops, initial, onClose, onSaved }: { tripId: string; stops: ItineraryStop[]; initial: TripReservation | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [d, setD] = useState<Draft>(() => fromReservation(initial));
  const [paste, setPaste] = useState("");
  const [filled, setFilled] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<{ signedIn: boolean; plan: string | null } | null>(null);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));

  // Fill only what was found, keeping what the traveller already typed.
  function apply(g: ReservationGuess | Record<string, unknown>) {
    const pick = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));
    setD((x) => {
      const next = { ...x };
      for (const k of ["kind", "name", "start", "end", "address", "phone", "confirmation", "guests", "planName", "priceYen", "payment", "bookedVia", "url"] as const) {
        const v = pick((g as Record<string, unknown>)[k]);
        if (v !== undefined) (next as Record<string, string>)[k] = v;
      }
      return next;
    });
    return Object.values(g).filter((v) => v !== null && v !== undefined && v !== "").length;
  }

  function readHere() {
    setFilled(apply(guessReservation(paste)));
  }

  async function readWithAi() {
    setReading(true);
    setError(null);
    setLimit(null);
    try {
      const { data } = await api.post(`/me/trips/${tripId}/reservations/read`, { text: paste });
      setFilled(apply(data));
    } catch (err: any) {
      const l = aiLimitOf(err);
      if (l) setLimit(l);
      else setError(err?.response?.data?.error ?? t("reservation.readError"));
    } finally {
      setReading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!d.name.trim() || !d.start) return setError(t("reservation.needNameDate"));
    setSaving(true);
    setError(null);
    const body = {
      kind: d.kind,
      name: d.name,
      reelId: d.reelId || null,
      startAt: localInputToIso(d.start),
      endAt: d.end ? localInputToIso(d.end) : null,
      address: d.address,
      phone: d.phone,
      confirmation: d.confirmation,
      guests: d.guests ? Number(d.guests) : null,
      planName: d.planName,
      priceYen: d.priceYen ? Number(d.priceYen.replace(/[^\d]/g, "")) : null,
      payment: d.payment,
      bookedVia: d.bookedVia,
      url: d.url,
      note: d.note,
    };
    try {
      if (initial) await api.put(`/me/trips/${tripId}/reservations/${initial.id}`, body);
      else await api.post(`/me/trips/${tripId}/reservations`, body);
      showToast(t("reservation.saved"));
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("reservation.saveError"));
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400";
  const label = "block text-xs font-medium text-gray-500";
  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("reservation.heading")}
        className="animate-sheet-in flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-white pb-[env(safe-area-inset-bottom)] md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <CalendarCheck className="h-5 w-5 text-jz-accent" />
          <h2 className="flex-1 text-sm font-bold text-gray-900">{initial ? t("reservation.editTitle") : t("reservation.addTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("reelViewer.closeLabel")} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={save} className="space-y-3 overflow-y-auto p-4">
          {!initial && (
            <div className="rounded-2xl bg-gray-50 p-3">
              <label className={label}>
                {t("reservation.pasteLabel")}
                <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={t("reservation.pastePlaceholder")} className={`${field} text-xs`} />
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={paste.trim().length < 20} onClick={readHere} className="inline-flex items-center gap-1 rounded-full bg-jz-ink px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">
                  <ClipboardPaste className="h-3.5 w-3.5" /> {t("reservation.readHere")}
                </button>
                <button type="button" disabled={paste.trim().length < 20 || reading} onClick={() => void readWithAi()} className="ai-border inline-flex rounded-full p-[1.5px] disabled:opacity-40">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-[5px] text-[11px] font-bold text-jz-ink">
                    {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-jz-accent" /> : <Sparkles className="h-3.5 w-3.5 text-jz-accent" />}
                    {t("reservation.readAi")}
                  </span>
                </button>
              </div>
              {filled != null && <p className="mt-2 text-[11px] text-gray-600">{filled > 0 ? t("reservation.filled", { count: filled }) : t("reservation.nothingFound")}</p>}
              {limit && <AiLimitNotice signedIn={limit.signedIn} plan={limit.plan} className="mt-2" />}
              <p className="mt-2 text-[10px] leading-relaxed text-gray-400">{t("reservation.pasteNote")}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => {
              const Icon = ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={d.kind === k}
                  onClick={() => setD((x) => ({ ...x, kind: k }))}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${d.kind === k ? "bg-jz-ink text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {t(`reservation.kind.${k}`)}
                </button>
              );
            })}
          </div>
          <label className={label}>
            {t("reservation.name")}
            <input value={d.name} onChange={set("name")} maxLength={80} required className={field} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              {t(d.kind === "lodging" ? "reservation.checkin" : "reservation.when")}
              <input type="datetime-local" value={d.start} onChange={set("start")} required className={field} />
            </label>
            <label className={label}>
              {t(d.kind === "lodging" ? "reservation.checkout" : "reservation.until")}
              <input type="datetime-local" value={d.end} onChange={set("end")} className={field} />
            </label>
          </div>
          <label className={label}>
            {t("reservation.confirmation")}
            <input value={d.confirmation} onChange={set("confirmation")} maxLength={60} className={`${field} font-mono`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("reservation.guests")}
              <input type="number" min={1} max={99} value={d.guests} onChange={set("guests")} className={field} />
            </label>
            <label className={label}>
              {t("reservation.price")}
              <input inputMode="numeric" value={d.priceYen} onChange={set("priceYen")} placeholder="¥" className={field} />
            </label>
          </div>
          <label className={label}>
            {t("reservation.plan")}
            <input value={d.planName} onChange={set("planName")} maxLength={120} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("reservation.paymentLabel")}
              <select value={d.payment} onChange={set("payment")} className={field}>
                <option value="">{t("reservation.payment.unknown")}</option>
                <option value="paid">{t("reservation.payment.paid")}</option>
                <option value="onsite">{t("reservation.payment.onsite")}</option>
              </select>
            </label>
            <label className={label}>
              {t("reservation.bookedVia")}
              <input value={d.bookedVia} onChange={set("bookedVia")} maxLength={60} placeholder="楽天トラベル" className={field} />
            </label>
          </div>
          <label className={label}>
            {t("reservation.address")}
            <input value={d.address} onChange={set("address")} maxLength={200} className={field} />
          </label>
          <label className={label}>
            {t("reservation.phone")}
            <input type="tel" value={d.phone} onChange={set("phone")} maxLength={30} className={field} />
          </label>
          <label className={label}>
            {t("reservation.url")}
            <input type="url" value={d.url} onChange={set("url")} placeholder="https://" className={field} />
          </label>
          {stops.length > 0 && (
            <label className={label}>
              {t("reservation.stop")}
              <select value={d.reelId} onChange={set("reelId")} className={field}>
                <option value="">{t("reservation.noStop")}</option>
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.locationName || s.caption.slice(0, 30)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={label}>
            {t("reservation.note")}
            <textarea value={d.note} onChange={set("note")} rows={2} maxLength={500} className={field} />
          </label>
          <p className="text-[10px] leading-relaxed text-gray-400">{t("reservation.privateNote")}</p>
          {error && <p className="text-xs text-jz-warm-text">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
              {t("dashboard.cancel")}
            </button>
            <button type="submit" disabled={saving} className="rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              {t("reservation.save")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
