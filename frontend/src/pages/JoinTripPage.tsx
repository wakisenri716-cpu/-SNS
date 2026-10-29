import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useIsTraveler } from "../components/ItineraryRail";
import { notifySavesChanged } from "../lib/savesChanged";
import { setCurrentTripId } from "../lib/trips";
import { showToast } from "../lib/toast";

interface InvitePreview {
  tripName: string;
  startDate: string | null;
  ownerName: string;
  count: number;
  people: number;
  coverVideoUrl: string | null;
}

// An invite link (/join/:token): whose trip it is, and "参加する" to plan it
// together. Signed-out visitors log in and come back.
export default function JoinTripPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const { token: session } = useAuth();
  const isTraveler = useIsTraveler();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [missing, setMissing] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api
      .get<InvitePreview>(`/trips/invite/${token}`)
      .then(({ data }) => setInvite(data))
      .catch(() => setMissing(true));
  }, [token]);

  async function join() {
    if (!session) return navigate("/login", { state: { from: `/join/${token}` } });
    setJoining(true);
    try {
      const { data } = await api.post<{ tripId: string }>(`/me/trips/join/${token}`);
      notifySavesChanged();
      setCurrentTripId(data.tripId);
      showToast(t("collab.joined"));
      navigate(`/itinerary/${data.tripId}`, { replace: true });
    } catch {
      showToast(t("collab.joinError"));
      setJoining(false);
    }
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-lg font-bold text-jz-ink">{t("collab.inviteInvalid")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{t("collab.inviteInvalidBody")}</p>
        <Link to="/" className="mt-6 inline-block rounded-full bg-jz-red px-5 py-2.5 text-sm font-bold text-white">
          {t("trip.explore")}
        </Link>
      </div>
    );
  }
  if (!invite) return <div className="mx-auto max-w-lg p-8"><div className="skeleton h-72 rounded-3xl" /></div>;

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-10 text-center">
      <span className="on-media relative block aspect-[4/5] w-48 overflow-hidden rounded-3xl bg-gray-100 shadow-xl">
        {invite.coverVideoUrl ? (
          <video src={`${invite.coverVideoUrl}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <span className="flex h-full items-center justify-center text-5xl" aria-hidden>
            🧳
          </span>
        )}
      </span>
      <p className="mt-6 text-xs font-semibold tracking-wide text-jz-red">{t("collab.invitedBy", { name: invite.ownerName })}</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-jz-ink">{invite.tripName}</h1>
      <p className="mt-1.5 flex items-center gap-1 text-sm text-gray-500">
        <Users className="h-4 w-4" />
        {[invite.startDate?.replace(/-/g, "/"), t("tripPicker.count", { count: invite.count }), t("collab.peopleCount", { count: invite.people })]
          .filter(Boolean)
          .join("・")}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-gray-600">{t("collab.joinExplain")}</p>
      {session && !isTraveler ? (
        <p className="mt-6 text-xs text-gray-500">{t("collab.travelersOnly")}</p>
      ) : (
        <button
          type="button"
          onClick={() => void join()}
          disabled={joining}
          className="mt-6 w-full rounded-full bg-jz-red py-3.5 text-sm font-bold text-white shadow-lg shadow-jz-red/30 active:scale-[0.98] disabled:opacity-60"
        >
          {session ? t("collab.join") : t("collab.loginToJoin")}
        </button>
      )}
    </div>
  );
}
