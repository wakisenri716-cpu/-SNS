import { Suspense, useEffect, useState, type ComponentType } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  ChartColumn,
  House,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Search,
  Settings,
  User,
  X,
  type LucideProps,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import Avatar from "./Avatar";
import JazibaLogo from "./JazibaLogo";
import ItineraryRail, { useIsTraveler } from "./ItineraryRail";
import { useUnreadNotificationCount } from "../lib/unreadNotifications";

type Icon = ComponentType<LucideProps>;
interface NavEntry {
  to: string;
  label: string;
  icon: Icon;
  badge?: number;
  className?: string;
}

function Badge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`min-w-5 rounded-full bg-[#ff3040] px-1.5 text-center text-[11px] font-bold leading-5 text-white ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SideNavItem({ to, label, icon: IconC, badge = 0, className = "" }: NavEntry) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-4 rounded-lg p-3 text-[15px] text-gray-900 transition-colors hover:bg-gray-100 ${
          isActive ? "font-bold" : "font-normal"
        } ${className}`
      }
    >
      {({ isActive }) => (
        <>
          <IconC className="h-6 w-6 shrink-0 transition-transform group-hover:scale-105" strokeWidth={isActive ? 2.6 : 1.8} />
          <span className="flex-1">{label}</span>
          <Badge count={badge} />
        </>
      )}
    </NavLink>
  );
}

// Primary destinations for the signed-in account type — shown in the sidebar
// on wider screens and as the bottom tab bar on phones.
function usePrimaryNav(unreadCount: number): NavEntry[] {
  const { user, municipality, company } = useAuth();
  const { t } = useTranslation();
  const home = { to: "/", label: t("nav.recommend"), icon: House };
  const search = { to: "/search", label: t("nav.search"), icon: Search };
  if (municipality || company) {
    return [
      home,
      search,
      { to: municipality ? "/dashboard" : "/company-dashboard", label: t("nav.manage"), icon: LayoutDashboard },
      { to: "/insights", label: t("nav.insights"), icon: ChartColumn },
      { to: "/notifications", label: t("notifications.heading"), icon: Bell, badge: unreadCount },
    ];
  }
  return [
    home,
    search,
    { to: "/itinerary", label: t("itinerary.heading"), icon: BookOpen },
    user ? { to: "/mypage", label: t("nav.myPage"), icon: User } : { to: "/login", label: t("nav.login"), icon: LogIn },
  ];
}

// Less-used links: the lower part of the sidebar, and the menu drawer on phones.
function SecondaryNav() {
  const { user, municipality, company, logout } = useAuth();
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      {!municipality && !company && (
        <>
          <SideNavItem to="/register-municipality" label={t("nav.forMunicipality")} icon={Building2} />
          <SideNavItem to="/register-company" label={t("nav.forCompany")} icon={Briefcase} />
        </>
      )}
      <SideNavItem to="/settings" label={t("nav.settings")} icon={Settings} />
      {user && (
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center gap-4 rounded-lg p-3 text-[15px] text-gray-900 hover:bg-gray-100"
        >
          <LogOut className="h-6 w-6" strokeWidth={1.8} />
          {t("nav.logout")}
        </button>
      )}
    </div>
  );
}

function AccountChip() {
  const { user, municipality, company } = useAuth();
  const { t } = useTranslation();
  if (!user) {
    return (
      <NavLink
        to="/login"
        className="block rounded-lg bg-[#0095f6] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#1877f2]"
      >
        {t("nav.login")}
      </NavLink>
    );
  }
  const name = municipality
    ? `${municipality.name}${t("nav.municipalitySuffix")}`
    : company
      ? `${company.name}${t("nav.companySuffix")}`
      : user.name;
  const avatar = municipality?.avatarUrl ?? company?.avatarUrl ?? user.avatarUrl;
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2">
      <Avatar name={name} src={avatar} size={28} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{name}</span>
    </div>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { municipality, company } = useAuth();
  // Only municipality/company accounts post, so only they receive お知らせ.
  const unreadCount = useUnreadNotificationCount(!!municipality || !!company);
  const primary = usePrimaryNav(unreadCount);
  const isTraveler = useIsTraveler();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen w-full flex-col text-gray-900 md:flex-row">
      {/* Phones: frosted top bar + bottom tab bar (below). */}
      <header className="sticky top-0 z-40 flex h-[53px] items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden">
        <NavLink to="/" aria-label={t("brand.name")}>
          <JazibaLogo className="h-8 w-auto" />
        </NavLink>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("nav.openMenu")}
          aria-expanded={menuOpen}
          className="-mr-2 flex h-10 w-10 items-center justify-center text-gray-900"
        >
          <Menu className="h-6 w-6" strokeWidth={1.8} />
        </button>
      </header>

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-gray-200 bg-white px-3 pb-5 pt-8 md:flex lg:w-[244px]">
        <NavLink to="/" className="mb-6 flex items-center px-3 pb-4" aria-label={t("brand.name")}>
          <JazibaLogo className="h-9 w-auto" />
        </NavLink>
        <nav className="flex flex-col gap-1">
          {primary.map((item) => (
            // The しおり rail is always visible on xl screens, so no link there.
            <SideNavItem key={item.to} {...item} className={item.to === "/itinerary" && isTraveler ? "xl:hidden" : ""} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <SecondaryNav />
          <AccountChip />
        </div>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col gap-4 overflow-y-auto bg-white px-3 py-5">
            <div className="flex items-center justify-between px-2">
              <AccountChip />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t("nav.closeMenu")}
                className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center text-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SecondaryNav />
          </div>
        </div>
      )}

      {/* pb on phones keeps content clear of the bottom tab bar. */}
      <main className="min-w-0 flex-1 pb-16 md:pb-0">
        <Suspense fallback={<p className="p-10 text-center text-sm text-gray-400">{t("feed.loading")}</p>}>
          <Outlet />
        </Suspense>
      </main>

      <ItineraryRail />

      <nav
        aria-label={t("nav.tabBar")}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primary.map(({ to, label, icon: IconC, badge = 0 }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            aria-label={label}
            className="relative flex h-12 flex-1 items-center justify-center text-gray-900"
          >
            {({ isActive }) => (
              <>
                <IconC className="h-[26px] w-[26px]" strokeWidth={isActive ? 2.6 : 1.7} />
                {badge > 0 && <Badge count={badge} className="absolute left-1/2 top-1 ml-1.5" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
