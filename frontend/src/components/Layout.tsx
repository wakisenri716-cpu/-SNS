import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex-1 py-3 text-center text-sm font-medium ${
          isActive ? "text-purple-600" : "text-gray-500"
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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-black text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-lg font-bold tracking-tight">TabiTube</span>
        {user ? (
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span>{municipality ? `${municipality.name}（自治体）` : user.name}</span>
            <button onClick={logout} className="rounded bg-white/10 px-2 py-1">
              ログアウト
            </button>
          </div>
        ) : (
          <NavLink to="/login" className="rounded bg-purple-600 px-3 py-1 text-xs">
            ログイン
          </NavLink>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <nav className="flex border-t border-white/10 bg-black">
        <NavItem to="/" label="おすすめ" />
        <NavItem to="/search" label="検索" />
        {municipality ? (
          <NavItem to="/dashboard" label="自治体管理" />
        ) : (
          <NavItem to="/register-municipality" label="自治体の方へ" />
        )}
      </nav>
    </div>
  );
}
