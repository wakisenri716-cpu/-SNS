import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BedDouble, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { clearPendingBooking, getPendingBooking, type PendingBooking } from "../lib/pendingBooking";
import { showToast } from "../lib/toast";

// Back from 楽天トラベル: 「予約できましたか？」 for the stay written into the
// しおり as 手続き中 when 予約へ was pressed (lib/pendingBooking.ts).
export default function PendingBookingPrompt() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingBooking | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const p = getPendingBooking();
      // Not the instant the booking page opens; forget it after three days.
      if (p && Date.now() - p.at > 3 * 86_400_000) return clearPendingBooking();
      if (p && Date.now() - p.at > 10_000) setPending(p);
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [user]);

  if (!pending) return null;
  const url = `/me/trips/${pending.tripId}/reservations/${pending.reservationId}`;
  async function answer(booked: boolean) {
    setBusy(true);
    try {
      if (booked) await api.patch(url, { status: "booked", ...(confirmation.trim() ? { confirmation: confirmation.trim() } : {}) });
      else await api.delete(url);
      showToast(t(booked ? "reservation.bookedSaved" : "reservation.dropped"));
    } catch {
      /* it may have been removed already */
    } finally {
      clearPendingBooking();
      setPending(null);
      setBusy(false);
    }
  }
  return (
    <div className="animate-sheet-in fixed inset-x-3 top-[4.5rem] z-[65] mx-auto max-w-md rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black/5 lg:bottom-6 lg:top-auto" role="dialog" aria-label={t("reservation.askTitle", { name: pending.name })}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-jz-tint text-jz-accent">
          <BedDouble className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-jz-ink">{t("reservation.askTitle", { name: pending.name })}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{t("reservation.askBody", { trip: pending.tripName })}</p>
        </div>
        <button type="button" onClick={() => setPending(null)} aria-label={t("reservation.later")} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        placeholder={t("reservation.askNumber")}
        aria-label={t("reservation.confirmation")}
        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-gray-400"
      />
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void answer(true)} className="flex-1 rounded-full bg-jz-accent py-2 text-sm font-bold text-white disabled:opacity-50">
          {t("reservation.yesBooked")}
        </button>
        <button type="button" disabled={busy} onClick={() => void answer(false)} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-50">
          {t("reservation.notBooked")}
        </button>
      </div>
      <Link to={`/itinerary/${pending.tripId}`} onClick={() => setPending(null)} className="mt-2 block text-center text-[11px] font-semibold text-gray-500 hover:underline">
        {t("reservation.openTrip")}
      </Link>
    </div>
  );
}
