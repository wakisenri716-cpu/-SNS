import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { MapPin, Nfc } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatStampDate } from "../lib/stampDate";
import Stamp from "../components/Stamp";

interface Spot {
  id: string;
  videoUrl: string;
  locationName: string;
  municipality: { id: string; name: string; prefecture: string };
}

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "ready"; spot: Spot; visitedAt: string | null; justNow: boolean; points?: number };

// 現地スタンプのタグ: what an NFC tag or printed QR code at a spot opens.
// A signed-in traveler gets the spot's stamp right away — no GPS needed,
// reading the tag on site is the check — with a buzz and the stamp itself.
export default function CheckinPage() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const { user, token: authToken } = useAuth();
  const location = useLocation();
  const [state, setState] = useState<State>({ kind: "loading" });
  const pressed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<{ spot: Spot; visitedAt: string | null }>(`/checkin/${token}`);
        if (cancelled) return;
        if (user?.role === "USER" && !data.visitedAt && !pressed.current) {
          pressed.current = true;
          const res = await api.post<{ spot: Spot; visitedAt: string; alreadyVisited: boolean; points?: number }>(`/checkin/${token}`);
          if (cancelled) return;
          navigator.vibrate?.([60, 40, 120]);
          setState({ kind: "ready", spot: res.data.spot, visitedAt: res.data.visitedAt, justNow: !res.data.alreadyVisited, points: res.data.points });
        } else {
          setState({ kind: "ready", spot: data.spot, visitedAt: data.visitedAt, justNow: false });
        }
      } catch (err) {
        if (!cancelled) setState({ kind: isAxiosError(err) && err.response?.status === 404 ? "missing" : "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.role, authToken]);

  if (state.kind === "loading") return <div className="skeleton mx-auto mt-10 h-72 max-w-sm rounded-3xl" />;
  if (state.kind !== "ready") {
    return (
      <div className="mx-auto max-w-sm p-6 text-center">
        <Nfc className="mx-auto h-10 w-10 text-gray-400" />
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{t(state.kind === "missing" ? "checkin.missing" : "checkin.error")}</p>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold text-jz-red">
          {t("shareIn.home")}
        </Link>
      </div>
    );
  }

  const { spot, visitedAt, justNow } = state;
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center p-6 text-center">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <Nfc className="h-4 w-4" /> {t("checkin.eyebrow")}
      </p>
      <h1 className="mt-2 text-xl font-extrabold text-jz-ink">{spot.locationName}</h1>
      <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
        <MapPin className="h-3 w-3" />
        {spot.municipality.name}・{spot.municipality.prefecture}
      </p>

      <div className={`mt-6 ${justNow ? "animate-like-pop" : ""} ${visitedAt ? "" : "opacity-30 grayscale"}`} aria-hidden>
        <Stamp place={spot.locationName} date={visitedAt ? formatStampDate(visitedAt) : ""} size={168} />
      </div>

      <div className="mt-6" aria-live="polite">
        {visitedAt ? (
          <>
            <p className="text-lg font-extrabold text-jz-ink">{justNow ? t("checkin.got") : t("checkin.already")}</p>
            <p className="mt-1 text-xs text-gray-500">
              {t("checkin.when", { date: new Date(visitedAt).toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" }) })}
              {justNow && state.points != null && ` ・${t("checkin.points", { points: state.points })}`}
            </p>
          </>
        ) : !authToken ? (
          <>
            <p className="text-sm leading-relaxed text-gray-600">{t("checkin.loginToGet")}</p>
            <Link to="/login" state={{ from: location.pathname }} className="mt-3 inline-block rounded-full bg-jz-red px-6 py-3 text-sm font-bold text-white">
              {t("checkin.login")}
            </Link>
            <p className="mt-3 text-xs text-gray-500">
              <Link to="/register" className="font-semibold text-jz-red">
                {t("checkin.register")}
              </Link>
            </p>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-gray-600">{t("checkin.travelersOnly")}</p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Link to={`/reels/${spot.id}/access`} className="rounded-full bg-gray-100 px-4 py-2 text-xs font-bold text-jz-ink hover:bg-gray-200">
          {t("checkin.openSpot")}
        </Link>
        {visitedAt && (
          <Link to="/mypage" className="rounded-full bg-gray-100 px-4 py-2 text-xs font-bold text-jz-ink hover:bg-gray-200">
            {t("checkin.stampBook")}
          </Link>
        )}
      </div>
    </div>
  );
}
