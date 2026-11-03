import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { CheckCircle2, Sparkles, Store, Ticket } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { showToast } from "../lib/toast";
import type { Coupon, CouponRedemption, PointsSummary } from "../types";

type Tab = "coupons" | "ai" | "mine";

// ポイントを使う: the balance, coupons from municipalities and the businesses
// under them (exchanged for points, shown at the counter), and AIチケット for
// more AI uses than the free ones each day.
export default function PointsPage() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const location = useLocation();
  const traveler = user?.role === "USER";
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get("tab") as Tab) || "coupons");
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [mine, setMine] = useState<CouponRedemption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, s, m] = await Promise.all([
      api.get<{ items: Coupon[] }>("/coupons").then((r) => r.data.items),
      token ? api.get<PointsSummary>("/points").then((r) => r.data) : Promise.resolve(null),
      traveler ? api.get<{ items: CouponRedemption[] }>("/coupons/mine").then((r) => r.data.items) : Promise.resolve([]),
    ]);
    setCoupons(c);
    setSummary(s);
    setMine(m);
  }, [token, traveler]);

  useEffect(() => {
    void load().catch(() => setCoupons([]));
  }, [load]);

  async function exchange(c: Coupon) {
    if (!window.confirm(t("points.exchangeConfirm", { title: c.title, points: c.pointsCost }))) return;
    setBusy(c.id);
    try {
      await api.post(`/coupons/${c.id}/redeem`);
      showToast(t("points.exchanged", { title: c.title }));
      await load();
      setTab("mine");
    } catch (err: any) {
      showToast(err?.response?.data?.code === "notEnoughPoints" ? t("points.notEnough") : err?.response?.data?.error ?? t("points.error"));
    } finally {
      setBusy(null);
    }
  }

  async function buyTickets(pack: string, points: number, credits: number) {
    if (!window.confirm(t("points.ticketConfirm", { points, credits }))) return;
    setBusy(pack);
    try {
      const { data } = await api.post<PointsSummary>("/points/ai-tickets", { pack });
      setSummary(data);
      showToast(t("points.ticketsBought", { credits }));
    } catch (err: any) {
      showToast(err?.response?.data?.code === "notEnoughPoints" ? t("points.notEnough") : t("points.error"));
    } finally {
      setBusy(null);
    }
  }

  const unused = mine?.filter((r) => !r.usedAt).length ?? 0;
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-8">
      <h1 className="text-xl font-extrabold text-jz-ink">{t("points.title")}</h1>
      {summary ? (
        <div className="mt-3 flex items-end gap-3 rounded-3xl bg-jz-ink p-5 text-white">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white/70">{t("points.balance")}</p>
            <p className="text-4xl font-black tabular-nums">{t("myPage.pointsValue", { points: summary.points })}</p>
            <p className="mt-1 text-[11px] text-white/60">{t("points.earnedSpent", { earned: summary.earned, spent: summary.spent })}</p>
          </div>
          <span className="h-14 w-14 shrink-0 rounded-full bg-jz-warm" aria-hidden />
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
          {t("points.loginNote")}{" "}
          <Link to="/login" state={{ from: "/points" }} className="font-bold text-jz-accent">
            {t("points.login")}
          </Link>
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{t("points.howToEarn")}</p>

      <div className="mt-5 flex gap-1.5" role="tablist">
        {(["coupons", "ai", ...(traveler ? (["mine"] as const) : [])] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${tab === k ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {t(`points.tab.${k}`)}
            {k === "mine" && unused > 0 && <span className="ml-1 rounded-full bg-jz-warm px-1.5 text-[10px] text-white">{unused}</span>}
          </button>
        ))}
      </div>

      {tab === "coupons" &&
        (coupons == null ? (
          <div className="skeleton mt-4 h-40 rounded-2xl" />
        ) : coupons.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500">{t("points.noCoupons")}</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {coupons.map((c) => {
              const short = summary != null && summary.points < c.pointsCost;
              const maxed = c.mineCount >= c.perUserLimit;
              return (
                <li key={c.id} className="flex gap-3 rounded-2xl border border-gray-200 p-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-jz-tint text-jz-accent">
                    <Store className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-gray-500">
                      {c.issuer.name}
                      {c.issuer.kind === "company" && `・${c.municipality.name}`}
                    </p>
                    <p className="text-sm font-bold text-jz-ink">{c.title}</p>
                    {c.description && <p className="mt-0.5 text-xs text-gray-600">{c.description}</p>}
                    <p className="mt-1 text-[11px] text-gray-500">
                      {[
                        c.validUntil && t("points.validUntil", { date: c.validUntil.replace(/-/g, "/") }),
                        c.remaining != null && t("points.remaining", { count: c.remaining }),
                        c.perUserLimit > 1 && t("points.perUser", { count: c.perUserLimit }),
                      ]
                        .filter(Boolean)
                        .join("・")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                    <span className="text-sm font-black tabular-nums text-jz-ink">{t("myPage.pointsValue", { points: c.pointsCost })}</span>
                    {traveler ? (
                      <button
                        type="button"
                        disabled={short || maxed || busy === c.id}
                        onClick={() => void exchange(c)}
                        className="rounded-full bg-jz-accent px-3 py-1.5 text-[11px] font-bold text-white disabled:bg-gray-200 disabled:text-gray-500"
                      >
                        {maxed ? t("points.have") : short ? t("points.short") : t("points.exchange")}
                      </button>
                    ) : !token ? (
                      <Link to="/login" state={{ from: "/points" }} className="text-[11px] font-bold text-jz-accent">
                        {t("points.login")}
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "ai" && (
        <section className="mt-4 space-y-3">
          <div className="rounded-2xl bg-jz-tint p-4 text-xs leading-relaxed text-jz-ink">
            <p className="flex items-center gap-1.5 font-bold">
              <Sparkles className="h-4 w-4 text-jz-accent" /> {t("points.aiHeading")}
            </p>
            <p className="mt-1">{t("points.aiIntro", { free: summary?.ai.freePerMonth ?? 30, perDay: summary?.ai.freeMaxPerDay ?? 10 })}</p>
            <ul className="mt-2 space-y-0.5">
              {(["concierge", "photoConcierge", "tripPlan", "tripCompose"] as const).map((f) => (
                <li key={f} className="flex justify-between gap-2">
                  <span>{t(`points.feature.${f}`)}</span>
                  <b className="shrink-0 tabular-nums">{t("points.unitsPerUse", { count: summary?.ai.units[f] ?? (f === "tripCompose" ? 5 : 1) })}</b>
                </li>
              ))}
            </ul>
            {summary && (
              <p className="mt-2 text-sm font-bold">
                {t("points.aiLeft", { month: summary.ai.freeLeftThisMonth, perMonth: summary.ai.freePerMonth, today: summary.ai.freeLeft, credits: summary.ai.credits })}
              </p>
            )}
          </div>
          {summary &&
            summary.ai.packs.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3">
                <Ticket className="h-6 w-6 shrink-0 text-jz-accent" />
                <p className="min-w-0 flex-1 text-sm font-bold text-jz-ink">{t("points.pack", { credits: p.credits })}</p>
                <button
                  type="button"
                  disabled={summary.points < p.points || busy === p.id}
                  onClick={() => void buyTickets(p.id, p.points, p.credits)}
                  className="rounded-full bg-jz-accent px-3 py-1.5 text-[11px] font-bold text-white disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {t("points.packButton", { points: p.points })}
                </button>
              </div>
            ))}
          <p className="text-[11px] leading-relaxed text-gray-500">{t("points.aiNote")}</p>
        </section>
      )}

      {tab === "mine" &&
        (mine == null ? (
          <div className="skeleton mt-4 h-40 rounded-2xl" />
        ) : mine.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500">{t("points.noneHeld")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {mine.map((r) => (
              <HeldCoupon key={r.id} r={r} lang={i18n.language} onUsed={() => void load()} />
            ))}
          </ul>
        ))}
    </div>
  );
}

// A coupon you hold: its code and QR to show; 使う once, in front of the staff.
function HeldCoupon({ r, lang, onUsed }: { r: CouponRedemption; lang: string; onUsed: () => void }) {
  const { t } = useTranslation();
  const [qr, setQr] = useState<string | null>(null);
  const [justUsed, setJustUsed] = useState(false);
  const expired = !!r.coupon.validUntil && r.coupon.validUntil < new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  useEffect(() => {
    if (r.usedAt) return;
    void QRCode.toDataURL(r.code, { width: 280, margin: 1, color: { dark: "#1f2a30", light: "#ffffff" } }).then(setQr);
  }, [r.code, r.usedAt]);

  async function use() {
    if (!window.confirm(t("points.useConfirm"))) return;
    try {
      await api.post(`/coupons/redemptions/${r.id}/use`);
      navigator.vibrate?.(120);
      setJustUsed(true);
      onUsed();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? t("points.error"));
    }
  }

  return (
    <li className={`rounded-3xl border p-4 ${r.usedAt ? "border-gray-200 bg-gray-50" : "border-jz-accent/40"}`}>
      <p className="text-[11px] text-gray-500">{r.coupon.issuer.name}</p>
      <p className="text-base font-extrabold text-jz-ink">{r.coupon.title}</p>
      {r.coupon.terms && <p className="mt-0.5 text-xs text-gray-600">{r.coupon.terms}</p>}
      {r.usedAt ? (
        <p className={`mt-3 flex items-center gap-1.5 text-sm font-bold text-gray-600 ${justUsed ? "animate-like-pop" : ""}`}>
          <CheckCircle2 className="h-5 w-5 text-jz-accent" />
          {t("points.usedAt", { time: new Date(r.usedAt).toLocaleString(lang, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) })}
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-4">
          {qr && <img src={qr} alt={t("points.qrAlt")} className="h-28 w-28 rounded-xl border border-gray-200" />}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-500">{t("points.code")}</p>
            <p className="font-mono text-2xl font-black tracking-widest text-jz-ink">{r.code}</p>
            {r.coupon.validUntil && <p className="mt-0.5 text-[11px] text-gray-500">{t("points.validUntil", { date: r.coupon.validUntil.replace(/-/g, "/") })}</p>}
            <button
              type="button"
              disabled={expired}
              onClick={() => void use()}
              className="mt-2 rounded-full bg-jz-accent px-4 py-2 text-xs font-bold text-white disabled:bg-gray-200 disabled:text-gray-500"
            >
              {expired ? t("points.expired") : t("points.useCoupon")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
