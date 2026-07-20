import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
    <div className="flex min-h-screen w-full bg-gray-50 text-gray-900">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-6">
        <NavLink to="/" className="mb-8 flex items-center gap-2 text-xl font-bold tracking-tight text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-sm text-white">
            T
          </span>
          TabiTube
        </NavLink>

        <nav className="flex flex-col gap-1">
          <NavItem to="/" label="おすすめ" />
          <NavItem to="/search" label="検索" />
          {municipality ? (
            <NavItem to="/dashboard" label="自治体管理" />
          ) : (
            <>
              {user && <NavItem to="/mypage" label="マイページ" />}
              <NavItem to="/register-municipality" label="自治体の方へ" />
            </>
          )}
        </nav>

        <div className="mt-auto">
          {user ? (
            <div className="flex flex-col gap-2">
              <span className="truncate text-sm font-medium text-gray-800">
                {municipality ? `${municipality.name}（自治体）` : user.name}
              </span>
              <button
                onClick={() => logout()}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <NavLink
              to="/login"
              className="block rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
            >
              ログイン
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
