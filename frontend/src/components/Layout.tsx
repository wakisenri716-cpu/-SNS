import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import JazibaLogo from "./JazibaLogo";
import ItineraryRail, { useIsTraveler } from "./ItineraryRail";
import { useUnreadNotificationCount } from "../lib/unreadNotifications";

function NavItem({
  to,
  label,
  className = "",
  badge = 0,
}: {
  to: string;
  label: string;
  className?: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? "bg-teal-600 text-white" : "text-gray-600 hover:bg-gray-100"
        } ${className}`
      }
    >
      <span className="flex items-center justify-between gap-2">
        {label}
        {badge > 0 && (
          <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
    </NavLink>
  );
}

// The menu itself — rendered in the fixed sidebar on tablet/desktop and in the
// slide-in drawer on phones, so both always offer the same links.
function MenuContent({ unreadCount }: { unreadCount: number }) {
  const { user, municipality, company, logout } = useAuth();
  const isTraveler = useIsTraveler();
  const { t } = useTranslation();

  return (
    <>
      <NavLink to="/" className="mb-8 flex items-center" aria-label={t("brand.name")}>
        <JazibaLogo className="h-9 w-auto" />
      </NavLink>

      <nav className="flex flex-col gap-1">
        <NavItem to="/" label={t("nav.recommend")} />
        <NavItem to="/search" label={t("nav.search")} />
        {/* The しおり rail only fits on xl screens; below that it's a page. */}
        {isTraveler && <NavItem to="/itinerary" label={`📖 ${t("itinerary.heading")}`} className="xl:hidden" />}
        {municipality ? (
          <>
            <NavItem to="/dashboard" label={t("nav.dashboardMunicipality")} />
            <NavItem to="/insights" label={t("nav.insights")} />
            <NavItem to="/notifications" label={`🔔 ${t("notifications.heading")}`} badge={unreadCount} />
          </>
        ) : company ? (
          <>
            <NavItem to="/company-dashboard" label={t("nav.dashboardCompany")} />
            <NavItem to="/insights" label={t("nav.insights")} />
            <NavItem to="/notifications" label={`🔔 ${t("notifications.heading")}`} badge={unreadCount} />
          </>
        ) : (
          <>
            {user && <NavItem to="/mypage" label={t("nav.myPage")} />}
            <NavItem to="/register-municipality" label={t("nav.forMunicipality")} />
            <NavItem to="/register-company" label={t("nav.forCompany")} />
          </>
        )}
      </nav>

      <div className="mt-auto">
        {user ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-gray-800">
                {municipality
                  ? `${municipality.name}${t("nav.municipalitySuffix")}`
                  : company
                    ? `${company.name}${t("nav.companySuffix")}`
                    : user.name}
              </span>
              <NavLink
                to="/settings"
                title={t("nav.settings")}
                className={({ isActive }) =>
                  `flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base ${
                    isActive ? "bg-teal-600 text-white" : "text-gray-500 hover:bg-gray-100"
                  }`
                }
              >
                ⚙️
              </NavLink>
            </div>
            <button
              onClick={() => logout()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              {t("nav.logout")}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <NavLink
              to="/login"
              className="flex-1 rounded-lg bg-teal-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-teal-700"
            >
              {t("nav.login")}
            </NavLink>
            <NavLink
              to="/settings"
              title={t("nav.settings")}
              className={({ isActive }) =>
                `flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${
                  isActive ? "bg-teal-600 text-white" : "text-gray-500 hover:bg-gray-100"
                }`
              }
            >
              ⚙️
            </NavLink>
          </div>
        )}
      </div>
    </>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { municipality, company } = useAuth();
  // Only municipality/company accounts post, so only they receive お知らせ.
  const unreadCount = useUnreadNotificationCount(!!municipality || !!company);
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
    <div className="flex min-h-screen w-full flex-col bg-gray-50 text-gray-900 md:flex-row">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 md:hidden">
        <NavLink to="/" aria-label={t("brand.name")}>
          <JazibaLogo className="h-7 w-auto" />
        </NavLink>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("nav.openMenu")}
          aria-expanded={menuOpen}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-xl text-gray-700 hover:bg-gray-100"
        >
          ☰
          {unreadCount > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" />}
        </button>
      </header>

      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-6 md:flex">
        <MenuContent unreadCount={unreadCount} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col overflow-y-auto bg-white px-4 py-6 shadow-xl">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label={t("nav.closeMenu")}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            >
              ✕
            </button>
            <MenuContent unreadCount={unreadCount} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>

      <ItineraryRail />
    </div>
  );
}
