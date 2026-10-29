import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Plus } from "lucide-react";
import { ItineraryPanel, useIsTraveler } from "../components/ItineraryRail";
import { useTrips } from "../lib/useTrips";
import { createTrip, setCurrentTripId } from "../lib/trips";
import { notifySavesChanged } from "../lib/savesChanged";
import { showToast } from "../lib/toast";

// しおり: the traveler's trips (旅) — make one first ("京都 2泊3日"), then
// choose it when bookmarking posts — and, at /itinerary/:tripId, one trip's
// しおり to arrange.
export default function ItineraryPage() {
  const { t } = useTranslation();
  const isTraveler = useIsTraveler();
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();

  if (!isTraveler) {
    return (
      <div className="mx-auto flex max-w-lg flex-col p-4 md:p-8">
        <p className="text-sm text-gray-500">
          <Link to="/login" className="font-semibold text-gray-900 hover:underline">
            {t("itinerary.loginCta")}
          </Link>
        </p>
      </div>
    );
  }

  if (tripId) {
    return (
      <div className="mx-auto flex max-w-lg flex-col p-4 md:p-8">
        <Link to="/itinerary" className="mb-3 inline-flex items-center gap-0.5 self-start text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> {t("trips.allTrips")}
        </Link>
        <ItineraryPanel
          key={tripId}
          tripId={tripId}
          headingLevel={1}
          onDeleted={() => {
            setCurrentTripId(null);
            navigate("/itinerary", { replace: true });
          }}
        />
      </div>
    );
  }
  return <TripList />;
}

function TripList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const trips = useTrips();
  const [params] = useSearchParams();
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const trip = await createTrip(name, date || null);
      notifySavesChanged();
      setCurrentTripId(trip.id);
      navigate(`/itinerary/${trip.id}`);
    } catch {
      showToast(t("tripPicker.error"));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col p-4 md:p-8">
      <h1 className="text-xl font-extrabold text-jz-ink">{t("trips.heading")}</h1>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">{t("trips.subtitle")}</p>

      {creating ? (
        <form onSubmit={create} className="animate-page-in mt-5 rounded-3xl border border-gray-200 bg-white p-4">
          <label className="block text-xs font-semibold text-gray-500" htmlFor="trip-name">
            {t("tripPicker.nameLabel")}
          </label>
          <input
            id="trip-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={t("tripPicker.namePlaceholder")}
            className="mt-1.5 w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm text-jz-ink outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-jz-red/30"
          />
          <label className="mt-3 block text-xs font-semibold text-gray-500" htmlFor="trip-date">
            {t("trips.dateLabelOptional")}
          </label>
          <input
            id="trip-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 rounded-2xl bg-gray-100 px-4 py-2.5 text-sm text-jz-ink outline-none focus:ring-2 focus:ring-jz-red/30"
          />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setCreating(false)} className="flex-1 rounded-full bg-gray-100 py-2.5 text-sm font-semibold text-jz-ink">
              {t("trips.cancel")}
            </button>
            <button type="submit" disabled={!name.trim() || busy} className="flex-[2] rounded-full bg-jz-red py-2.5 text-sm font-bold text-white disabled:opacity-40">
              {t("trips.createAction")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-5 flex items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-jz-red/40 py-4 text-sm font-bold text-jz-red transition hover:bg-jz-tint active:scale-[0.99]"
        >
          <Plus className="h-5 w-5" /> {t("tripPicker.newTrip")}
        </button>
      )}

      {trips == null ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton aspect-[4/5] rounded-3xl" />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <p className="mt-6 text-center text-xs leading-relaxed text-gray-500">{t("trips.none")}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link to={`/itinerary/${trip.id}`} onClick={() => setCurrentTripId(trip.id)} className="group block">
                <span className="on-media relative block aspect-[4/5] overflow-hidden rounded-3xl bg-gray-100">
                  {trip.coverVideoUrl ? (
                    <video src={`${trip.coverVideoUrl}#t=0.1`} className="h-full w-full object-cover transition group-hover:scale-105" muted playsInline preload="metadata" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl" aria-hidden>
                      🧳
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-white">
                    <span className="block truncate text-sm font-extrabold">{trip.name}</span>
                    <span className="block text-[11px] text-white/80">
                      {[trip.startDate?.replace(/-/g, "/"), t("tripPicker.count", { count: trip.count })].filter(Boolean).join("・")}
                    </span>
                    {(trip.people > 1 || !trip.isOwner) && (
                      <span className="mt-0.5 block truncate text-[11px] font-semibold text-white">
                        👥 {trip.isOwner ? t("collab.peopleCount", { count: trip.people }) : t("collab.ownersTrip", { name: trip.ownerName })}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
