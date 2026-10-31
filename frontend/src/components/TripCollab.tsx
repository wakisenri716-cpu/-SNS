import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, MapPin, Navigation, UserPlus, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import Avatar from "./Avatar";
import { shareLink } from "../lib/shareLink";
import { showToast } from "../lib/toast";
import { notifySavesChanged } from "../lib/savesChanged";
import type { TripLocation, TripPerson } from "../lib/useTripLive";
import { useShareLocation } from "../lib/useShareLocation";
import { distanceKm, formatDistance } from "../lib/geo";
import { relativeTime } from "../lib/relativeTime";
import type { Itinerary } from "../types";

// 一緒に計画する: the people planning this trip, with the invite link
// (/join/:token) for the owner and "抜ける" for members. `here` is who has
// the しおり open right now (live); `locations` where those sharing their
// position are (みんなの現在地), shown against the trip's stops.
export default function TripCollab({
  itinerary,
  here,
  locations = [],
  onChange,
  onLeft,
}: {
  itinerary: Itinerary;
  here: TripPerson[];
  locations?: TripLocation[];
  onChange: () => void;
  onLeft?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const share = useShareLocation(itinerary.trip.id);
  const located = new Map(locations.map((l) => [l.id, l]));

  // "松本城の近く（約120m）" — or how far from the nearest stop.
  function whereIs(loc: TripLocation) {
    let best: { name: string; km: number } | null = null;
    for (const s of itinerary.stops) {
      const km = distanceKm(loc, { lat: s.locationLat, lng: s.locationLng });
      if (!best || km < best.km) best = { name: s.locationName || s.municipality.name, km };
    }
    if (!best) return t("collab.locationShared");
    return best.km <= 1 ? t("collab.nearStop", { place: best.name, distance: formatDistance(best.km) }) : t("collab.fromStop", { place: best.name, distance: formatDistance(best.km) });
  }
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const base = `/me/trips/${itinerary.trip.id}`;
  const everyone = [itinerary.owner, ...itinerary.members];
  const online = new Set(here.map((p) => p.id));

  async function invite() {
    setBusy(true);
    try {
      const token = itinerary.inviteToken ?? (await api.post<{ token: string }>(`${base}/invite`)).data.token;
      if (!itinerary.inviteToken) onChange();
      const url = `${window.location.origin}/join/${token}`;
      const result = await shareLink(url, t("collab.inviteTitle", { trip: itinerary.trip.name }));
      if (result === "copied") showToast(t("share.copied"));
      else if (result === "manual") window.prompt(t("share.copyManually"), url);
    } catch {
      showToast(t("tripPicker.error"));
    } finally {
      setBusy(false);
    }
  }

  async function stopInvite() {
    await api.delete(`${base}/invite`);
    onChange();
    showToast(t("collab.inviteStopped"));
  }

  async function remove(person: { id: string; name: string }) {
    const self = person.id === user?.id;
    if (!window.confirm(self ? t("collab.leaveConfirm", { trip: itinerary.trip.name }) : t("collab.removeConfirm", { name: person.name }))) return;
    await api.delete(`${base}/members/${person.id}`);
    notifySavesChanged();
    if (self) {
      showToast(t("collab.left"));
      onLeft?.();
    } else onChange();
  }

  return (
    <section className="mt-4 rounded-2xl border border-gray-200 p-3" aria-label={t("collab.heading")}>
      <p className="text-xs font-semibold text-gray-500">{t("collab.heading")}</p>
      <ul className="mt-2 space-y-1.5">
        {everyone.map((person, i) => (
          <li key={person.id} className="flex items-center gap-2">
            <span className="relative">
              <Avatar name={person.name} src={null} size={28} />
              {online.has(person.id) && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-jz-ink">
                {person.name}
                {person.id === user?.id && <span className="ml-1 text-[11px] text-gray-500">{t("collab.you")}</span>}
              </span>
              {located.has(person.id) && (
                <span className="flex items-center gap-1 truncate text-[11px] font-semibold text-emerald-700">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {whereIs(located.get(person.id)!)}・{relativeTime(new Date(located.get(person.id)!.at).toISOString(), i18n.language)}
                </span>
              )}
            </span>
            <span className="text-[11px] text-gray-500">{i === 0 ? t("collab.owner") : online.has(person.id) ? t("collab.online") : ""}</span>
            {i > 0 && (itinerary.isOwner || person.id === user?.id) && (
              <button
                type="button"
                onClick={() => void remove(person)}
                aria-label={person.id === user?.id ? t("collab.leave") : t("collab.remove", { name: person.name })}
                className="rounded-full p-1 text-gray-400 hover:bg-jz-tint hover:text-jz-red"
              >
                {person.id === user?.id ? <LogOut className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </button>
            )}
          </li>
        ))}
      </ul>
      {everyone.length > 1 && (
        <div className="mt-3 rounded-xl bg-gray-50 p-2.5">
          <button
            type="button"
            onClick={() => (share.sharing ? share.stop() : share.start())}
            aria-pressed={share.sharing}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              share.sharing ? "bg-emerald-600 text-white" : "bg-white text-jz-ink ring-1 ring-gray-200"
            }`}
          >
            <Navigation className="h-3.5 w-3.5" /> {share.sharing ? t("collab.stopSharingLocation") : t("collab.shareLocation")}
          </button>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
            {share.error ? t("compass.noLocation") : share.sharing ? t("collab.sharingNote") : t("collab.shareNote")}
          </p>
        </div>
      )}
      {itinerary.isOwner ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void invite()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-jz-red px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" /> {t("collab.invite")}
          </button>
          {itinerary.inviteToken && (
            <button type="button" onClick={() => void stopInvite()} className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100">
              {t("collab.stopInvite")}
            </button>
          )}
        </div>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
        {itinerary.isOwner ? t("collab.ownerNote") : t("collab.memberNote", { name: itinerary.owner.name })}
      </p>
    </section>
  );
}
