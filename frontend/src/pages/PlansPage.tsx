import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, CreditCard, Gem, Loader2 } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { goToBilling } from "../lib/billing";
import { showToast } from "../lib/toast";
import type { BillingInfo, PlanId } from "../types";

type Role = "USER" | "COMPANY" | "MUNICIPALITY";
const SECTION: Record<Role, string> = { USER: "travelers", COMPANY: "companies", MUNICIPALITY: "municipalities" };

// 有料プラン: free and paid side by side for this kind of account (all three
// kinds when signed out). Card plans go to Stripe Checkout; the plan turns on
// when Stripe tells the server, so after paying this page waits for it.
export default function PlansPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<"checking" | "slow" | null>(params.get("checkout") === "success" ? "checking" : null);

  const load = useCallback(() => api.get<BillingInfo>("/billing").then((r) => (setInfo(r.data), r.data)), []);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  // Back from Stripe: the webhook usually lands within seconds.
  useEffect(() => {
    const result = params.get("checkout");
    if (!result) return;
    if (result === "cancel") showToast(t("plans.checkoutCancel"));
    setParams({}, { replace: true });
    if (result !== "success") return;
    let tries = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const data = await load().catch(() => null);
      if (data?.current?.active) {
        setWaiting(null);
        showToast(t("plans.activated", { plan: t(`plans.name.${data.current.plan}`) }));
      } else if (++tries < 15) setTimeout(() => void tick(), 2000);
      else setWaiting("slow");
    };
    void tick();
    return () => {
      stopped = true;
    };
    // Runs once for the query the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function go(key: string, path: "/billing/checkout" | "/billing/portal", body?: unknown) {
    setBusy(key);
    try {
      await goToBilling(path, body);
    } catch (err: any) {
      showToast(err?.response?.data?.code === "paymentsNotReady" ? t("plans.paymentsNotReady") : err?.response?.data?.error ?? t("plans.error"));
      setBusy(null);
    }
  }

  const role = user?.role as Role | undefined;
  const roles: Role[] = role ? [role] : ["USER", "COMPANY", "MUNICIPALITY"];
  const current = info?.current;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" }) : "");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-jz-ink">
        <Gem className="h-6 w-6 text-jz-accent" /> {t("plans.title")}
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">{t("plans.subtitle")}</p>

      {waiting && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-jz-tint p-3 text-xs font-semibold text-jz-ink" role="status">
          {waiting === "checking" && <Loader2 className="h-4 w-4 animate-spin text-jz-accent" />}
          {t(waiting === "checking" ? "plans.checkoutSuccess" : "plans.checkoutPending")}
        </p>
      )}
      {info && !info.paymentsReady && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">{t("plans.paymentsNotReady")}</p>}

      {!info ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="skeleton h-72 rounded-3xl" />
          <div className="skeleton h-72 rounded-3xl" />
        </div>
      ) : (
        roles.map((r) => {
          const paid = info.plans.find((p) => p.role === r)!;
          const mine = current && current.plan === paid.id ? current : null;
          const onPaid = !!mine?.active;
          const features = (tier: "free" | "paid") => {
            const l = info.limits[tier];
            const ai = t("plans.feature.ai", { month: l.aiPerMonth, day: l.aiPerDay });
            if (r === "USER") return tier === "free" ? [ai, t("plans.feature.basics"), t("plans.feature.points")] : [ai, t("plans.feature.compose", { count: Math.floor(l.aiPerMonth / 5) }), t("plans.feature.basics")];
            const coupons = t("plans.feature.coupons", { count: l.coupons[r] });
            const extra = tier === "paid" && r === "MUNICIPALITY" ? [t("plans.feature.invoice")] : [];
            return [coupons, ai, t("plans.feature.posting"), ...extra];
          };
          return (
            <section key={r} className="mt-6" aria-labelledby={`plans-${r}`}>
              {roles.length > 1 && (
                <h2 id={`plans-${r}`} className="mb-2 text-sm font-bold text-gray-500">
                  {t(`plans.${SECTION[r]}`)}
                </h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <PlanCard
                  name={t("plans.name.free")}
                  price={t("plans.freePrice")}
                  features={features("free")}
                  badge={role === r && !onPaid ? t("plans.current") : null}
                />
                <PlanCard
                  featured
                  name={t(`plans.name.${paid.id}`)}
                  price={paid.priceYen != null ? `${paid.priceYen.toLocaleString(i18n.language)}${t("plans.perMonth")}` : t("plans.byInvoice")}
                  features={features("paid")}
                  badge={onPaid ? t("plans.current") : t("plans.recommended")}
                  status={
                    mine && onPaid
                      ? mine.status === "past_due"
                        ? t("plans.pastDue")
                        : mine.cancelAtPeriodEnd
                          ? t("plans.endsOn", { date: date(mine.currentPeriodEnd) })
                          : mine.currentPeriodEnd
                            ? t(mine.source === "stripe" ? "plans.renews" : "plans.validUntil", { date: date(mine.currentPeriodEnd) })
                            : null
                      : null
                  }
                >
                  <PlanAction
                    plan={paid.id}
                    signedIn={!!user}
                    forThisAccount={role === r}
                    onPaid={onPaid}
                    card={mine?.source === "stripe" || (!mine && paid.priceYen != null)}
                    purchasable={paid.purchasable}
                    busy={busy}
                    onCheckout={() => void go(paid.id, "/billing/checkout", { plan: paid.id })}
                    onPortal={() => void go("portal", "/billing/portal")}
                  />
                </PlanCard>
              </div>
            </section>
          );
        })
      )}

      <p className="mt-6 flex gap-2 text-[11px] leading-relaxed text-gray-500">
        <CreditCard className="h-4 w-4 shrink-0" /> {t("plans.note")}
      </p>
      <Link to="/legal/commerce" className="mt-2 inline-block text-[11px] font-semibold text-gray-600 underline">
        {t("plans.commerceLink")}
      </Link>
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  badge,
  status = null,
  featured = false,
  children,
}: {
  name: string;
  price: string;
  features: string[];
  badge: string | null;
  status?: string | null;
  featured?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-3xl p-5 ${
        featured ? "bg-jz-ink text-white shadow-xl shadow-jz-accent/20 ring-1 ring-jz-accent/40" : "border border-gray-200 bg-white text-jz-ink"
      }`}
    >
      {featured && <span className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-jz-accent/40 blur-2xl" aria-hidden />}
      <div className="relative flex items-center gap-2">
        <p className="text-lg font-extrabold">{name}</p>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${featured ? "bg-jz-warm text-white" : "bg-gray-100 text-gray-600"}`}>{badge}</span>
        )}
      </div>
      <p className="relative mt-1 text-2xl font-black tabular-nums">{price}</p>
      <ul className="relative mt-4 flex-1 space-y-2 text-[13px] leading-snug">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-jz-accent" : "text-gray-400"}`} strokeWidth={3} />
            <span className={featured ? "text-white/90" : "text-gray-700"}>{f}</span>
          </li>
        ))}
      </ul>
      {status && <p className={`relative mt-4 text-[11px] font-semibold ${featured ? "text-white/70" : "text-gray-500"}`}>{status}</p>}
      {children && <div className="relative mt-4">{children}</div>}
    </div>
  );
}

function PlanAction(props: {
  plan: PlanId;
  signedIn: boolean;
  forThisAccount: boolean;
  onPaid: boolean;
  /** Paid by card through Stripe (自治体プロ is by invoice). */
  card: boolean;
  purchasable: boolean;
  busy: string | null;
  onCheckout: () => void;
  onPortal: () => void;
}) {
  const { t } = useTranslation();
  const button = "flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold active:scale-[0.98] disabled:opacity-50";
  const spin = <Loader2 className="h-4 w-4 animate-spin" />;
  if (!props.card)
    return (
      <Link to="/contact" className={`${button} bg-white text-jz-ink`}>
        {t("plans.contact")}
      </Link>
    );
  if (!props.signedIn)
    return (
      <Link to="/login" state={{ from: "/plans" }} className={`${button} bg-jz-accent text-white`}>
        {t("plans.loginToSubscribe")}
      </Link>
    );
  if (!props.forThisAccount) return null;
  if (props.onPaid)
    return (
      <button type="button" disabled={!!props.busy} onClick={props.onPortal} className={`${button} bg-white text-jz-ink`}>
        {props.busy === "portal" && spin}
        {t("plans.manage")}
      </button>
    );
  return (
    <button type="button" disabled={!props.purchasable || !!props.busy} onClick={props.onCheckout} className={`${button} bg-jz-accent text-white`}>
      {props.busy === props.plan && spin}
      {props.purchasable ? t("plans.subscribe", { plan: t(`plans.name.${props.plan}`) }) : t("plans.notReady")}
    </button>
  );
}
