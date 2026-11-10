import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, Ban, BadgeCheck, Building2, ChartColumn, Flag, Gem, ImagePlus, Inbox, ListChecks, Loader2, Mail, Search, ShieldCheck, Trash2, UserCheck, Users } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import JazibaLogo from "../components/JazibaLogo";
import { showToast } from "../lib/toast";
import SubmissionInbox from "../components/SubmissionInbox";

// 管理者サイト: the operator's own console, apart from the app's menus. Only
// accounts in the server's ADMIN_EMAILS get in (the API checks every call).
const SECTIONS = [
  { key: "", icon: ChartColumn, label: "admin.nav.overview" },
  { key: "approvals", icon: UserCheck, label: "admin.nav.approvals", badge: "pendingApprovals" },
  { key: "inquiries", icon: Inbox, label: "admin.nav.inquiries", badge: "inquiriesOpen" },
  { key: "listingSubmissions", icon: ImagePlus, label: "admin.nav.listingSubmissions", badge: "pendingListingSubmissions" },
  { key: "users", icon: Users, label: "admin.nav.users" },
  { key: "reports", icon: Flag, label: "admin.nav.reports", badge: "reportedComments" },
  { key: "logs", icon: ListChecks, label: "admin.nav.logs" },
] as const;

const USD_JPY = 150;
const yen = (microUsd: number) => Math.round((microUsd / 1_000_000) * USD_JPY);

interface Overview {
  users: { byRole: Record<string, number>; total: number; new7d: number; suspended: number; signupsByDay: { day: string; count: number }[] };
  content: { reels: number; comments: number; visits30d: number };
  todo: { pendingSubmissions: number; inquiriesOpen: number; reportedComments: number; pendingApprovals: number; pendingListingSubmissions: number };
  listingPages: number;
  plans: { plus: number; business: number; municipalityPro: number; monthlyYen: number };
  ai: {
    todayMicroUsd: number;
    monthMicroUsd: number;
    monthUnits: number;
    monthRequests: number;
    dailyBudgetMicroUsd: number;
    monthlyBudgetMicroUsd: number;
    byFeature: { feature: string; requests: number; units: number; microUsd: number }[];
  };
  recentLogs: Log[];
}
interface Log {
  id: string;
  adminName: string;
  action: string;
  targetId: string;
  detail: string;
  createdAt: string;
}

export default function AdminPage() {
  const { t } = useTranslation();
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const { section = "" } = useParams();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  // Why not: ADMIN_EMAILS isn't set on the server, or this account isn't in it.
  const [configured, setConfigured] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    const title = document.title;
    document.title = t("admin.title");
    return () => {
      meta.remove();
      document.title = title;
    };
  }, [t]);

  useEffect(() => {
    if (!user) return setAllowed(null);
    api
      .get("/admin/me")
      .then(() => setAllowed(true))
      .catch((err) => {
        setConfigured(err?.response?.data?.configured !== false);
        setAllowed(false);
      });
  }, [user]);

  const loadOverview = useCallback(() => {
    void api
      .get<Overview>("/admin/overview")
      .then(({ data }) => setOverview(data))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (allowed) loadOverview();
  }, [allowed, section, loadOverview]);

  if (!ready) return null;
  if (!user || allowed === false)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-8 w-8 text-jz-accent" />
          <p className="mt-2 text-lg font-extrabold text-jz-ink">{t("admin.title")}</p>
          <p className="mt-1 text-sm text-gray-600">{t(user ? "admin.notAllowed" : "admin.loginFirst")}</p>
          {user && (
            <>
              <p className="mt-3 rounded-xl bg-gray-50 p-2 text-xs text-gray-600">{t("admin.signedInAs", { email: user.email })}</p>
              <p className="mt-2 text-left text-xs leading-relaxed text-gray-600">{t(configured ? "admin.hintNotListed" : "admin.hintNotConfigured")}</p>
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate("/login", { state: { from: "/admin" } });
                }}
                className="mt-4 inline-block rounded-full bg-jz-accent px-5 py-2 text-sm font-bold text-white"
              >
                {t("admin.switchAccount")}
              </button>
            </>
          )}
          {!user && (
            <Link to="/login" state={{ from: "/admin" }} className="mt-4 inline-block rounded-full bg-jz-accent px-5 py-2 text-sm font-bold text-white">
              {t("nav.login")}
            </Link>
          )}
          <Link to="/" className="mt-3 block text-xs text-gray-500 hover:underline">
            {t("admin.backToApp")}
          </Link>
        </div>
      </div>
    );
  if (allowed == null)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-jz-accent" />
      </div>
    );

  return (
    <div className="min-h-dvh bg-gray-50 lg:flex">
      <aside className="sticky top-0 z-10 bg-jz-ink text-white lg:h-dvh lg:w-60 lg:shrink-0">
        <div className="flex items-center gap-2 px-4 py-3 lg:px-5 lg:py-6">
          <span className="rounded-lg bg-white px-2 py-1">
            <JazibaLogo className="h-5" />
          </span>
          <span className="text-xs font-bold tracking-widest text-white/70">ADMIN</span>
        </div>
        <nav className="scrollbar-none flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:px-3" aria-label={t("admin.title")}>
          {SECTIONS.map((s) => {
            const count = "badge" in s && overview ? overview.todo[s.badge] : 0;
            return (
              <NavLink
                key={s.key}
                to={`/admin${s.key ? `/${s.key}` : ""}`}
                end
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10"}`
                }
              >
                <s.icon className="h-4 w-4" />
                {t(s.label)}
                {count > 0 && <span className="rounded-full bg-jz-warm px-1.5 text-[10px] font-bold text-white">{count}</span>}
              </NavLink>
            );
          })}
          <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/10 lg:mt-6">
            <ArrowLeft className="h-4 w-4" /> {t("admin.backToApp")}
          </Link>
        </nav>
      </aside>
      <main className="mx-auto w-full max-w-5xl p-4 lg:p-8">
        {section === "" && <OverviewSection data={overview} />}
        {section === "approvals" && <ApprovalsSection onChange={loadOverview} />}
        {section === "inquiries" && <InquiriesSection onChange={loadOverview} />}
        {section === "listingSubmissions" && (
          <>
            <Heading>{t("admin.nav.listingSubmissions")}</Heading>
            <SubmissionInbox admin onCountsChange={loadOverview} />
          </>
        )}
        {section === "users" && <UsersSection />}
        {section === "reports" && <ReportsSection onChange={loadOverview} />}
        {section === "logs" && <LogsSection />}
      </main>
    </div>
  );
}

function Heading({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-extrabold text-jz-ink">{children}</h1>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function Tile({ label, value, note, to }: { label: string; value: string; note?: string; to?: string }) {
  const body = (
    <>
      <p className="text-[11px] font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-jz-ink">{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-gray-500">{note}</p>}
    </>
  );
  const cls = "block rounded-2xl border border-gray-200 bg-white p-4";
  return to ? (
    <Link to={to} className={`${cls} hover:border-gray-300`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ---- 概要 ------------------------------------------------------------------------

function OverviewSection({ data }: { data: Overview | null }) {
  const { t, i18n } = useTranslation();
  const n = (v: number) => v.toLocaleString(i18n.language);
  if (!data)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
    );
  const aiShare = data.ai.monthlyBudgetMicroUsd > 0 ? Math.min(1, data.ai.monthMicroUsd / data.ai.monthlyBudgetMicroUsd) : 0;
  return (
    <>
      <Heading sub={t("admin.overview.sub")}>{t("admin.nav.overview")}</Heading>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("admin.overview.users")} value={n(data.users.total)} note={t("admin.overview.new7d", { count: data.users.new7d })} to="/admin/users" />
        <Tile label={t("admin.overview.monthlyYen")} value={`¥${n(data.plans.monthlyYen)}`} note={t("admin.overview.cardOnly")} />
        <Tile
          label={t("admin.overview.paid")}
          value={n(data.plans.plus + data.plans.business + data.plans.municipalityPro)}
          note={t("admin.overview.paidBreakdown", { plus: data.plans.plus, business: data.plans.business, pro: data.plans.municipalityPro })}
        />
        <Tile label={t("admin.overview.aiMonth")} value={`¥${n(yen(data.ai.monthMicroUsd))}`} note={t("admin.overview.aiToday", { yen: n(yen(data.ai.todayMicroUsd)) })} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label={t("admin.overview.pendingApprovals")} value={n(data.todo.pendingApprovals)} to="/admin/approvals" />
        <Tile label={t("admin.overview.inquiriesOpen")} value={n(data.todo.inquiriesOpen)} to="/admin/inquiries" />
        <Tile label={t("admin.overview.reported")} value={n(data.todo.reportedComments)} to="/admin/reports" />
        <Tile label={t("admin.overview.pendingSubmissions")} value={n(data.todo.pendingSubmissions)} note={t("admin.overview.pendingNote")} />
        <Tile
          label={t("admin.overview.pendingListingSubmissions")}
          value={n(data.todo.pendingListingSubmissions)}
          note={t("admin.overview.listingPages", { count: data.listingPages })}
          to="/admin/listingSubmissions"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <SignupsChart days={data.users.signupsByDay} />
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-jz-ink">{t("admin.overview.aiBudget")}</h2>
          <p className="mt-1 text-xs text-gray-500">
            {t("admin.overview.aiBudgetLine", { used: n(yen(data.ai.monthMicroUsd)), budget: n(yen(data.ai.monthlyBudgetMicroUsd)), pct: Math.round(aiShare * 100) })}
          </p>
          <div
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(aiShare * 100)}
            aria-label={t("admin.overview.aiBudget")}
          >
            <div className={`h-full rounded-full ${aiShare >= 0.9 ? "bg-jz-warm" : "bg-jz-accent"}`} style={{ width: `${aiShare * 100}%` }} />
          </div>
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-[11px] text-gray-500">
              <tr>
                <th className="py-1 font-semibold">{t("admin.overview.feature")}</th>
                <th className="py-1 text-right font-semibold">{t("admin.overview.requests")}</th>
                <th className="py-1 text-right font-semibold">{t("admin.overview.cost")}</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {data.ai.byFeature.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-2 text-gray-500">
                    {t("admin.overview.noAi")}
                  </td>
                </tr>
              ) : (
                data.ai.byFeature.map((f) => (
                  <tr key={f.feature} className="border-t border-gray-100">
                    <td className="py-1.5">{t(`points.feature.${f.feature}`, { defaultValue: f.feature })}</td>
                    <td className="py-1.5 text-right tabular-nums">{n(f.requests)}</td>
                    <td className="py-1.5 text-right tabular-nums">¥{n(yen(f.microUsd))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-gray-400">{t("admin.overview.aiNote", { rate: USD_JPY })}</p>
        </section>
      </div>

      <Integrations />

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
          <h2 className="font-bold text-jz-ink">{t("admin.overview.accounts")}</h2>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-gray-700">
            {(["USER", "MUNICIPALITY", "COMPANY"] as const).map((r) => (
              <div key={r} className="contents">
                <dt>{t(`admin.role.${r}`)}</dt>
                <dd className="text-right tabular-nums">{n(data.users.byRole[r] ?? 0)}</dd>
              </div>
            ))}
            <dt>{t("admin.overview.suspended")}</dt>
            <dd className="text-right tabular-nums">{n(data.users.suspended)}</dd>
            <dt>{t("admin.overview.reels")}</dt>
            <dd className="text-right tabular-nums">{n(data.content.reels)}</dd>
            <dt>{t("admin.overview.comments")}</dt>
            <dd className="text-right tabular-nums">{n(data.content.comments)}</dd>
            <dt>{t("admin.overview.visits30d")}</dt>
            <dd className="text-right tabular-nums">{n(data.content.visits30d)}</dd>
          </dl>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-jz-ink">{t("admin.overview.recent")}</h2>
          <LogList logs={data.recentLogs} />
          <Link to="/admin/logs" className="mt-2 inline-block text-xs font-semibold text-jz-accent">
            {t("admin.overview.allLogs")}
          </Link>
        </section>
      </div>
    </>
  );
}

// 連携の状況: which outside services the server has settings for (and which part is missing).
function Integrations() {
  const { t } = useTranslation();
  const [items, setItems] = useState<{ id: string; ready: boolean; parts: Record<string, boolean> }[] | null>(null);
  useEffect(() => {
    void api.get("/admin/integrations").then(({ data }) => setItems(data.items));
  }, []);
  if (!items) return null;
  return (
    <section className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-bold text-jz-ink">{t("admin.integrations.heading")}</h2>
      <ul className="mt-2 divide-y divide-gray-100 text-xs">
        {items.map((i) => {
          const missing = Object.entries(i.parts)
            .filter(([k, v]) => !v && k !== "affiliateId" && !k.startsWith("price"))
            .map(([k]) => t(`admin.integrations.part.${k}`, { defaultValue: k }));
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${i.ready ? "bg-jz-accent" : "bg-gray-300"}`} aria-hidden />
              <span className="font-semibold text-gray-800">{t(`admin.integrations.name.${i.id}`)}</span>
              <span className={i.ready ? "text-jz-accent" : "text-gray-500"}>{t(i.ready ? "admin.integrations.ready" : "admin.integrations.notReady")}</span>
              {!i.ready && missing.length > 0 && <span className="text-jz-warm-text">{t("admin.integrations.missing", { list: missing.join("・") })}</span>}
              {i.id === "rakuten" && i.ready && !i.parts.affiliateId && <span className="text-gray-400">{t("admin.integrations.noAffiliate")}</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-gray-400">{t("admin.integrations.note")}</p>
    </section>
  );
}

// Sign-ups per day, one series: bars from the baseline with a tooltip on hover/focus.
function SignupsChart({ days }: { days: { day: string; count: number }[] }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const label = (d: string) => d.slice(5).replace("-", "/");
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-jz-ink">{t("admin.overview.signups")}</h2>
        <span className="text-[11px] text-gray-500">{t("admin.overview.signupsTotal", { count: days.reduce((sum, d) => sum + d.count, 0) })}</span>
      </div>
      <div className="relative mt-3">
        <div className="flex h-32 items-end gap-[2px] border-b border-gray-200" role="list">
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              role="listitem"
              aria-label={t("admin.overview.signupsOn", { day: label(d.day), count: d.count })}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="group flex h-full flex-1 items-end"
            >
              <span
                className={`w-full rounded-t-[4px] ${hover === i ? "bg-jz-accent-dark" : "bg-jz-accent"}`}
                style={{ height: `${Math.max(d.count > 0 ? 4 : 0, (d.count / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
        {hover != null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-jz-ink px-2 py-1 text-[11px] font-semibold text-white shadow"
            style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
          >
            {t("admin.overview.signupsOn", { day: label(days[hover].day), count: days[hover].count })}
          </div>
        )}
        <div className="mt-1 flex justify-between text-[10px] text-gray-400">
          <span>{label(days[0].day)}</span>
          <span>{label(days[days.length - 1].day)}</span>
        </div>
      </div>
    </section>
  );
}

const ACTION_LABEL: Record<string, string> = {
  suspend: "admin.log.suspend",
  unsuspend: "admin.log.unsuspend",
  plan: "admin.log.plan",
  deleteComment: "admin.log.deleteComment",
  dismissReports: "admin.log.dismissReports",
  inquiryDone: "admin.log.inquiryDone",
  inquiryOpen: "admin.log.inquiryOpen",
  approve: "admin.log.approve",
  reject: "admin.log.reject",
  approveSubmission: "admin.log.approveSubmission",
  rejectSubmission: "admin.log.rejectSubmission",
  postSubmission: "admin.log.postSubmission",
};

function LogList({ logs }: { logs: Log[] }) {
  const { t } = useTranslation();
  if (logs.length === 0) return <p className="mt-2 text-xs text-gray-500">{t("admin.log.none")}</p>;
  return (
    <ul className="mt-2 divide-y divide-gray-100 text-xs">
      {logs.map((l) => (
        <li key={l.id} className="flex flex-wrap gap-x-2 py-1.5">
          <span className="tabular-nums text-gray-400">{new Date(l.createdAt).toLocaleString()}</span>
          <span className="font-semibold text-jz-ink">{t(ACTION_LABEL[l.action] ?? l.action)}</span>
          {l.detail && <span className="min-w-0 truncate text-gray-600">{l.detail}</span>}
          <span className="text-gray-400">{l.adminName}</span>
        </li>
      ))}
    </ul>
  );
}

function LogsSection() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<Log[] | null>(null);
  useEffect(() => {
    void api.get<{ items: Log[] }>("/admin/logs").then(({ data }) => setLogs(data.items));
  }, []);
  return (
    <>
      <Heading sub={t("admin.log.sub")}>{t("admin.nav.logs")}</Heading>
      <div className="rounded-2xl border border-gray-200 bg-white p-4">{logs ? <LogList logs={logs} /> : <div className="skeleton h-40 rounded-xl" />}</div>
    </>
  );
}

// ---- 登録の承認 ----------------------------------------------------------------------

interface Applicant {
  id: string;
  name: string;
  email: string;
  role: "MUNICIPALITY" | "COMPANY";
  createdAt: string;
  approval: "pending" | "approved" | "rejected";
  approvalNote: string;
  reviewedAt: string | null;
  municipality: { id: string; name: string; prefecture: string } | null;
  company: { id: string; name: string; municipality: { id: string; name: string; prefecture: string } } | null;
  emailDomain: string;
  officialDomain: boolean;
  sameName: { id: string; listing: boolean; approved: boolean }[];
}

function ApprovalsSection({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<Applicant[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    void api.get<{ items: Applicant[] }>(`/admin/approvals?status=${status}`).then(({ data }) => setItems(data.items));
  }, [status]);
  useEffect(load, [load]);

  async function decide(a: Applicant, decision: "approve" | "reject") {
    const note = decision === "reject" ? window.prompt(t("admin.approvals.rejectReason", { name: a.municipality?.name ?? a.company?.name ?? a.name })) : "";
    if (note == null) return;
    setBusy(a.id);
    try {
      await api.post(`/admin/approvals/${a.id}`, { decision, note });
      showToast(t(decision === "approve" ? "admin.approvals.approved" : "admin.approvals.rejected"));
      load();
      onChange();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? t("admin.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Heading sub={t("admin.approvals.sub")}>{t("admin.nav.approvals")}</Heading>
      <Chips
        value={status}
        onChange={setStatus}
        options={[
          ["pending", t("admin.approvals.pending")],
          ["approved", t("admin.approvals.approvedTab")],
          ["rejected", t("admin.approvals.rejectedTab")],
        ]}
      />
      {items == null ? (
        <div className="skeleton mt-3 h-40 rounded-2xl" />
      ) : items.length === 0 ? (
        <Empty>{t(status === "pending" ? "admin.approvals.none" : "admin.approvals.noneDecided")}</Empty>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((a) => {
            const org = a.municipality
              ? `${a.municipality.prefecture}${a.municipality.name}`
              : a.company
                ? a.company.name
                : a.name;
            return (
              <li key={a.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-jz-accent" />
                  <p className="text-base font-extrabold text-jz-ink">{org}</p>
                  <Badge>{t(`admin.role.${a.role}`)}</Badge>
                  <span className="ml-auto text-[11px] tabular-nums text-gray-400">{t("admin.approvals.registeredAt", { date: new Date(a.createdAt).toLocaleString() })}</span>
                </div>
                {a.company && (
                  <p className="mt-0.5 text-xs text-gray-600">{t("admin.approvals.under", { municipality: `${a.company.municipality.prefecture}${a.company.municipality.name}` })}</p>
                )}
                <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-y-1 text-xs">
                  <dt className="text-gray-500">{t("admin.approvals.person")}</dt>
                  <dd className="text-gray-800">{a.name}</dd>
                  <dt className="text-gray-500">{t("admin.approvals.email")}</dt>
                  <dd className="flex flex-wrap items-center gap-1.5 text-gray-800">
                    {a.email}
                    {a.officialDomain ? (
                      <Badge tone="accent">
                        <BadgeCheck className="mr-0.5 inline h-3 w-3 align-[-2px]" />
                        {t("admin.approvals.lgDomain")}
                      </Badge>
                    ) : (
                      <Badge>{t("admin.approvals.otherDomain")}</Badge>
                    )}
                  </dd>
                </dl>
                {a.sameName.length > 0 && (
                  <p className="mt-2 flex gap-1.5 rounded-xl bg-orange-50 p-2 text-[11px] leading-relaxed text-jz-warm-text">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {t("admin.approvals.sameName", {
                      list: a.sameName.map((m) => t(m.listing ? "admin.approvals.sameListing" : m.approved ? "admin.approvals.sameApproved" : "admin.approvals.samePending")).join("・"),
                    })}
                  </p>
                )}
                {status !== "pending" && (
                  <p className="mt-2 text-[11px] text-gray-500">
                    {t("admin.approvals.decidedAt", { date: a.reviewedAt ? new Date(a.reviewedAt).toLocaleString() : "—" })}
                    {a.approvalNote && `・${a.approvalNote}`}
                  </p>
                )}
                {status === "pending" && <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{t("admin.approvals.howToCheck")}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {a.approval !== "approved" && (
                    <button type="button" disabled={busy === a.id} onClick={() => void decide(a, "approve")} className="rounded-full bg-jz-accent px-4 py-1.5 font-bold text-white disabled:opacity-50">
                      {t("admin.approvals.approve")}
                    </button>
                  )}
                  {a.approval !== "rejected" && (
                    <button type="button" disabled={busy === a.id} onClick={() => void decide(a, "reject")} className="rounded-full bg-white px-4 py-1.5 font-bold text-gray-800 ring-1 ring-gray-300 disabled:opacity-50">
                      {t("admin.approvals.reject")}
                    </button>
                  )}
                  <a href={`mailto:${a.email}?subject=${encodeURIComponent(t("admin.approvals.mailSubject"))}`} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 font-bold text-gray-800 hover:bg-gray-200">
                    <Mail className="h-3.5 w-3.5" /> {t("admin.approvals.mail")}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ---- お問い合わせ ----------------------------------------------------------------

interface Inquiry {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
  handledAt: string | null;
}

function InquiriesSection({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"open" | "done">("open");
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const load = useCallback(() => {
    void api.get<{ items: Inquiry[] }>(`/admin/inquiries?status=${status}`).then(({ data }) => setItems(data.items));
  }, [status]);
  useEffect(load, [load]);

  async function mark(i: Inquiry, done: boolean) {
    await api.patch(`/admin/inquiries/${i.id}`, { done });
    load();
    onChange();
  }

  return (
    <>
      <Heading sub={t("admin.inquiries.sub")}>{t("admin.nav.inquiries")}</Heading>
      <Chips value={status} onChange={setStatus} options={[["open", t("admin.inquiries.open")], ["done", t("admin.inquiries.done")]]} />
      {items == null ? (
        <div className="skeleton mt-3 h-40 rounded-2xl" />
      ) : items.length === 0 ? (
        <Empty>{t("admin.inquiries.none")}</Empty>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((i) => (
            <li key={i.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-sm font-bold text-jz-ink">{i.name}</p>
                <p className="text-xs text-gray-500">{i.email}</p>
                <p className="ml-auto text-[11px] tabular-nums text-gray-400">{new Date(i.createdAt).toLocaleString()}</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{i.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`mailto:${i.email}?subject=${encodeURIComponent(t("admin.inquiries.replySubject"))}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-jz-accent px-3 py-1.5 text-xs font-bold text-white"
                >
                  <Mail className="h-3.5 w-3.5" /> {t("admin.inquiries.reply")}
                </a>
                <button type="button" onClick={() => void mark(i, !i.handledAt)} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-800 hover:bg-gray-200">
                  {i.handledAt ? t("admin.inquiries.reopen") : t("admin.inquiries.markDone")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---- ユーザー ----------------------------------------------------------------------

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "MUNICIPALITY" | "COMPANY";
  createdAt: string;
  suspendedAt: string | null;
  isAdmin: boolean;
  municipality: { id: string; name: string; prefecture: string; listing?: boolean } | null;
  company: { id: string; name: string; municipality: { name: string } } | null;
  plan: { plan: string; status: string; source: string; currentPeriodEnd: string | null; active: boolean } | null;
  _count: { comments: number; visits: number; submissions: number };
}

const PLAN_FOR_ROLE: Record<AdminUser["role"], string> = { USER: "plus", COMPANY: "business", MUNICIPALITY: "municipalityPro" };

function UsersSection() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [data, setData] = useState<{ total: number; items: AdminUser[]; page: number; pageSize: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    async (page = 0, query = q) => {
      const params = new URLSearchParams({ page: String(page) });
      if (query.trim()) params.set("q", query.trim());
      if (role === "suspended") params.set("suspended", "1");
      else if (role === "listings") params.set("listings", "1");
      else if (role) params.set("role", role);
      const { data: res } = await api.get(`/admin/users?${params}`);
      setData((prev) => (page > 0 && prev ? { ...res, items: [...prev.items, ...res.items] } : res));
    },
    // The query is passed in on search; the role chips reload at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role]
  );
  useEffect(() => {
    void load(0);
  }, [load]);

  function search(e: FormEvent) {
    e.preventDefault();
    void load(0, q);
  }

  return (
    <>
      <Heading sub={t("admin.users.sub")}>{t("admin.nav.users")}</Heading>
      <form onSubmit={search} className="flex gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-gray-300 bg-white px-3">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.users.search")} aria-label={t("admin.users.search")} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
        </label>
        <button type="submit" className="rounded-full bg-jz-ink px-4 text-sm font-bold text-white">
          {t("admin.users.searchButton")}
        </button>
      </form>
      <div className="mt-2">
        <Chips
          value={role}
          onChange={setRole}
          options={[
            ["", t("admin.users.all")],
            ["USER", t("admin.role.USER")],
            ["MUNICIPALITY", t("admin.role.MUNICIPALITY")],
            ["COMPANY", t("admin.role.COMPANY")],
            ["suspended", t("admin.overview.suspended")],
            ["listings", t("admin.users.showListings")],
          ]}
        />
      </div>
      {data == null ? (
        <div className="skeleton mt-3 h-60 rounded-2xl" />
      ) : data.items.length === 0 ? (
        <Empty>{t("admin.users.none")}</Empty>
      ) : (
        <>
          <p className="mt-3 text-[11px] text-gray-500">{t("admin.users.count", { count: data.total })}</p>
          <ul className="mt-1 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {data.items.map((u) => (
              <UserRow key={u.id} user={u} open={open === u.id} onToggle={() => setOpen(open === u.id ? null : u.id)} onChanged={() => void load(0)} />
            ))}
          </ul>
          {data.items.length < data.total && (
            <button type="button" onClick={() => void load(data.page + 1)} className="mt-3 w-full rounded-full bg-gray-100 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200">
              {t("admin.users.more")}
            </button>
          )}
        </>
      )}
    </>
  );
}

function UserRow({ user: u, open, onToggle, onChanged }: { user: AdminUser; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const org = u.municipality ? `${u.municipality.prefecture}${u.municipality.name}` : u.company ? `${u.company.name}（${u.company.municipality.name}）` : null;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      showToast(done);
      onChanged();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? t("admin.error"));
    } finally {
      setBusy(false);
    }
  }
  function suspend(on: boolean) {
    const reason = on ? window.prompt(t("admin.users.suspendReason", { name: u.name })) : "";
    if (reason == null) return;
    void run(() => api.post(`/admin/users/${u.id}/suspend`, { suspended: on, reason }), t(on ? "admin.users.suspended" : "admin.users.restored"));
  }

  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-jz-ink">
            {u.name}
            <Badge>{t(`admin.role.${u.role}`)}</Badge>
            {u.municipality?.listing && <Badge>{t("admin.users.listing")}</Badge>}
            {u.isAdmin && <Badge tone="accent">{t("admin.users.admin")}</Badge>}
            {u.plan?.active && <Badge tone="accent">{t(`plans.name.${u.plan.plan}`)}</Badge>}
            {u.suspendedAt && <Badge tone="warn">{t("admin.overview.suspended")}</Badge>}
          </p>
          <p className="truncate text-xs text-gray-500">
            {u.email}
            {org && `・${org}`}
          </p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{new Date(u.createdAt).toLocaleDateString()}</span>
      </button>
      {open && (
        <div className="space-y-3 bg-gray-50 px-4 py-3 text-xs">
          <p className="text-gray-600">
            {t("admin.users.activity", { comments: u._count.comments, visits: u._count.visits, submissions: u._count.submissions })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Gem className="h-4 w-4 text-jz-accent" />
            <span className="font-semibold text-jz-ink">
              {u.plan
                ? t("admin.users.planNow", {
                    plan: t(`plans.name.${u.plan.plan}`),
                    source: t(`admin.users.source.${u.plan.source}`, { defaultValue: u.plan.source }),
                    until: u.plan.currentPeriodEnd ? new Date(u.plan.currentPeriodEnd).toLocaleDateString() : "—",
                    state: u.plan.active ? t("admin.users.planActive") : t("admin.users.planEnded"),
                  })
                : t("admin.users.noPlan")}
            </span>
          </div>
          {u.plan?.source !== "stripe" || !u.plan.active ? (
            <div className="flex flex-wrap items-center gap-2">
              <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label={t("admin.users.months")} className="rounded-lg border border-gray-300 bg-white px-2 py-1">
                {[1, 3, 6, 12, 24].map((m) => (
                  <option key={m} value={m}>
                    {t("admin.users.monthsValue", { count: m })}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => api.post(`/admin/users/${u.id}/plan`, { plan: PLAN_FOR_ROLE[u.role], months }), t("admin.users.planGiven"))}
                className="rounded-full bg-jz-accent px-3 py-1.5 font-bold text-white disabled:opacity-50"
              >
                {t("admin.users.givePlan", { plan: t(`plans.name.${PLAN_FOR_ROLE[u.role]}`) })}
              </button>
              {u.plan && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api.post(`/admin/users/${u.id}/plan`, { plan: "none" }), t("admin.users.planRemoved"))}
                  className="rounded-full bg-white px-3 py-1.5 font-bold text-gray-700 ring-1 ring-gray-300 disabled:opacity-50"
                >
                  {t("admin.users.removePlan")}
                </button>
              )}
            </div>
          ) : (
            <p className="text-gray-500">{t("admin.users.stripeNote")}</p>
          )}
          {!u.isAdmin && (
            <button
              type="button"
              disabled={busy}
              onClick={() => suspend(!u.suspendedAt)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold disabled:opacity-50 ${u.suspendedAt ? "bg-white text-gray-800 ring-1 ring-gray-300" : "bg-jz-warm text-white"}`}
            >
              <Ban className="h-3.5 w-3.5" /> {u.suspendedAt ? t("admin.users.restore") : t("admin.users.suspend")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ---- 通報 ----------------------------------------------------------------------------

interface Reported {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string; suspendedAt: string | null };
  reel: { id: string; locationName: string | null; municipality: { name: string } };
  reports: number;
  reasons: Record<"spam" | "abuse" | "other", number>;
}

function ReportsSection({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Reported[] | null>(null);
  const load = () => void api.get<{ items: Reported[] }>("/admin/reports").then(({ data }) => setItems(data.items));
  useEffect(load, []);

  async function act(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      showToast(done);
      load();
      onChange();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? t("admin.error"));
    }
  }

  return (
    <>
      <Heading sub={t("admin.reports.sub")}>{t("admin.nav.reports")}</Heading>
      {items == null ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : items.length === 0 ? (
        <Empty>{t("admin.reports.none")}</Empty>
      ) : (
        <ul className="space-y-2.5">
          {items.map((c) => (
            <li key={c.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge tone="warn">{t("admin.reports.count", { count: c.reports })}</Badge>
                {(["spam", "abuse", "other"] as const)
                  .filter((r) => c.reasons[r] > 0)
                  .map((r) => (
                    <Badge key={r}>{`${t(`admin.reports.reason.${r}`)} ${c.reasons[r]}`}</Badge>
                  ))}
                <span className="ml-auto text-[11px] text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{c.body}</p>
              <p className="mt-1 text-[11px] text-gray-500">
                {t("admin.reports.by", { name: c.user.name })}・
                <button type="button" onClick={() => navigate(`/reels/${c.reel.id}/access`)} className="font-semibold text-jz-accent hover:underline">
                  {c.reel.locationName || c.reel.municipality.name}
                </button>
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => void act(() => api.post(`/admin/reports/${c.id}/dismiss`), t("admin.reports.dismissed"))} className="rounded-full bg-gray-100 px-3 py-1.5 font-bold text-gray-800 hover:bg-gray-200">
                  {t("admin.reports.dismiss")}
                </button>
                <button
                  type="button"
                  onClick={() => window.confirm(t("admin.reports.deleteConfirm")) && void act(() => api.delete(`/admin/comments/${c.id}`), t("admin.reports.deleted"))}
                  className="inline-flex items-center gap-1 rounded-full bg-jz-warm px-3 py-1.5 font-bold text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("admin.reports.delete")}
                </button>
                {!c.user.suspendedAt && (
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt(t("admin.users.suspendReason", { name: c.user.name }));
                      if (reason != null) void act(() => api.post(`/admin/users/${c.user.id}/suspend`, { suspended: true, reason }), t("admin.users.suspended"));
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-bold text-gray-800 ring-1 ring-gray-300"
                  >
                    <Ban className="h-3.5 w-3.5" /> {t("admin.users.suspend")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---- small pieces --------------------------------------------------------------------

function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${value === v ? "bg-jz-ink text-white" : "bg-white text-gray-600 ring-1 ring-gray-200"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Badge({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" | "warn" }) {
  const cls = tone === "accent" ? "bg-jz-tint text-jz-accent" : tone === "warn" ? "bg-orange-50 text-jz-warm-text" : "bg-gray-100 text-gray-600";
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{children}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-xs text-gray-500">{children}</p>;
}
