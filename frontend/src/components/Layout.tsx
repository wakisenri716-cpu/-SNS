import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? "bg-teal-600 text-white" : "text-gray-600 hover:bg-gray-100"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, municipality, company, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen w-full bg-gray-50 text-gray-900">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-6">
        <NavLink to="/" className="mb-8 flex items-center gap-2 text-xl font-bold tracking-tight text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-sm text-white">
            T
          </span>
          TabiTube
        </NavLink>

        <nav className="flex flex-col gap-1">
          <NavItem to="/" label={t("nav.recommend")} />
          <NavItem to="/search" label={t("nav.search")} />
          {municipality ? (
            <NavItem to="/dashboard" label={t("nav.dashboardMunicipality")} />
          ) : company ? (
            <NavItem to="/company-dashboard" label={t("nav.dashboardCompany")} />
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
            <NavLink
              to="/login"
              className="block rounded-lg bg-teal-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-teal-700"
            >
              {t("nav.login")}
            </NavLink>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
