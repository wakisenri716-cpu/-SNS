import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, municipality, logout } = useAuth();

  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-8">
          <NavLink to="/" className="text-xl font-bold tracking-tight text-gray-900">
            TabiTube
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavItem to="/" label="おすすめ" />
            <NavItem to="/search" label="検索" />
            {municipality ? (
              <NavItem to="/dashboard" label="自治体管理" />
            ) : (
              <NavItem to="/register-municipality" label="自治体の方へ" />
            )}
          </nav>
        </div>

        {user ? (
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="font-medium text-gray-800">
              {municipality ? `${municipality.name}（自治体）` : user.name}
            </span>
            <button
              onClick={logout}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              ログアウト
            </button>
          </div>
        ) : (
          <NavLink
            to="/login"
            className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            ログイン
          </NavLink>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
