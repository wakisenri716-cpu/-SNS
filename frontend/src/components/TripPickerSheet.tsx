import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Plus, X } from "lucide-react";
import { addToTrip, createTrip, listTrips, onTripPicker, removeFromTrip, type TripPickerRequest, type TripSummary } from "../lib/trips";
import { showToast } from "../lib/toast";

// "どの旅に入れる？" — opened by every bookmark button (lib/trips chooseTrips).
// For one post: tick the trips it should be in (one or several), or make a
// new trip on the spot. For several posts at once (a shared しおり's "まとめて
// 追加"): pick the trip to add them all to.
function TripPickerSheet({ request, onClose }: { request: TripPickerRequest; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const single = request.reelIds.length === 1;
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listTrips(single ? request.reelIds[0] : undefined)
      .then((items) => {
        setTrips(items);
        if (items.length === 0) setCreating(true);
      })
      .catch(() => setTrips([]));
  }, [request, single]);

  const savedAnywhere = !!trips?.some((trip) => trip.containsReel);
  const close = () => onClose(single ? savedAnywhere : false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Puts the post(s) into / takes the post out of one trip.
  async function apply(trip: TripSummary) {
    if (!single) {
      await Promise.all(request.reelIds.map((id) => addToTrip(trip.id, id)));
      showToast(t("tripPicker.addedMany", { count: request.reelIds.length, trip: trip.name }), {
        label: t("feed.savedToastAction"),
        to: `/itinerary/${trip.id}`,
      });
      onClose(true);
      return;
    }
    const reelId = request.reelIds[0];
    if (trip.containsReel) await removeFromTrip(trip.id, reelId);
    else await addToTrip(trip.id, reelId);
    setTrips((prev) =>
      prev?.map((x) => (x.id === trip.id ? { ...x, containsReel: !x.containsReel, count: x.count + (x.containsReel ? -1 : 1) } : x)) ??
        null
    );
  }

  async function toggle(trip: TripSummary) {
    if (busy) return;
    setBusy(true);
    try {
      await apply(trip);
    } catch {
      showToast(t("tripPicker.error"));
    } finally {
      setBusy(false);
    }
  }

  // A new trip is made to put this post in, so it goes straight in.
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const trip = await createTrip(name);
      const fresh = { ...trip, containsReel: false };
      setName("");
      setCreating(false);
      setTrips((prev) => [fresh, ...(prev ?? [])]);
      await apply(fresh);
    } catch {
      showToast(t("tripPicker.error"));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[80] flex items-end justify-center bg-black/40 md:items-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("tripPicker.title")}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-in flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white md:rounded-[28px]"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-jz-ink">{single ? t("tripPicker.title") : t("tripPicker.titleMany", { count: request.reelIds.length })}</h2>
            <p className="truncate text-[11px] text-gray-500">{request.title}</p>
          </div>
          <button type="button" onClick={close} aria-label={t("reelViewer.closeLabel")} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {trips && trips.length === 0 && <p className="px-2 pb-2 text-sm leading-relaxed text-gray-600">{t("tripPicker.firstTrip")}</p>}
          <ul className="space-y-1">
            {(trips ?? []).map((trip) => (
              <li key={trip.id}>
                <button
                  type="button"
                  onClick={() => void toggle(trip)}
                  disabled={busy}
                  aria-pressed={single ? !!trip.containsReel : undefined}
                  className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-gray-50 active:scale-[0.99]"
                >
                  <span className="on-media h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                    {trip.coverVideoUrl && <video src={`${trip.coverVideoUrl}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-jz-ink">{trip.name}</span>
                    <span className="block text-[11px] text-gray-500">
                      {[
                        trip.startDate?.replace(/-/g, "/"),
                        t("tripPicker.count", { count: trip.count }),
                        !trip.isOwner ? t("collab.ownersTrip", { name: trip.ownerName }) : trip.people > 1 ? `👥 ${trip.people}` : null,
                      ]
                        .filter(Boolean)
                        .join("・")}
                    </span>
                  </span>
                  {single ? (
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
                        trip.containsReel ? "border-jz-red bg-jz-red text-white" : "border-gray-300 text-transparent"
                      }`}
                      aria-hidden
                    >
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                  ) : (
                    <Plus className="h-5 w-5 shrink-0 text-jz-red" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {creating ? (
            <form onSubmit={create} className="mt-2 flex gap-2 px-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder={t("tripPicker.namePlaceholder")}
                aria-label={t("tripPicker.nameLabel")}
                className="min-w-0 flex-1 rounded-full bg-gray-100 px-4 py-2.5 text-sm text-jz-ink outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-jz-red/30"
              />
              <button type="submit" disabled={!name.trim() || busy} className="shrink-0 rounded-full bg-jz-red px-4 text-sm font-bold text-white disabled:opacity-40">
                {t("tripPicker.create")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-1 flex w-full items-center gap-3 rounded-2xl p-2 text-left text-sm font-bold text-jz-red hover:bg-jz-tint"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-jz-red/40">
                <Plus className="h-5 w-5" />
              </span>
              {t("tripPicker.newTrip")}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Link to="/itinerary" onClick={close} className="flex-1 rounded-full py-2.5 text-center text-sm font-semibold text-gray-600 hover:bg-gray-50">
            {t("tripPicker.seeTrips")}
          </Link>
          <button type="button" onClick={close} className="flex-1 rounded-full bg-jz-ink py-2.5 text-sm font-bold text-white">
            {t("tripPicker.done")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Mounted once in the layout; shows the sheet whenever chooseTrips() asks.
export default function TripPickerHost() {
  const [request, setRequest] = useState<TripPickerRequest | null>(null);
  useEffect(() => onTripPicker(setRequest), []);
  if (!request) return null;
  return (
    <TripPickerSheet
      key={request.reelIds.join(",")}
      request={request}
      onClose={(saved) => {
        request.resolve(saved);
        setRequest(null);
      }}
    />
  );
}
