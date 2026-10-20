import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { CreditCard, HandCoins, Home, LogOut, Wallet } from "lucide-react";
import { usePortalAuth } from "../../context/PortalAuthContext";
import { cn } from "../../lib/utils";

export function PortalLayout() {
  const { pathname } = useLocation();
  const { user, logout } = usePortalAuth();

  if (!user) {
    return <Navigate to="/portal/login" replace />;
  }

  const isMipil = user.klasifikasiKode === "MIPIL";
  const isPemasih = user.klasifikasiKode === "KRAMA_TAMIU" || user.klasifikasiKode === "TAMIU";

  const nav = [
    { to: "/portal", label: "Beranda", icon: Home, exact: true },
    { to: "/portal/kartu", label: "Kartu", icon: CreditCard, exact: false },
    ...(isMipil
      ? [{ to: "/portal/paturunan", label: "Paturunan", icon: Wallet, exact: false }]
      : []),
    ...(isPemasih
      ? [{ to: "/portal/dudukan", label: "Dudukan", icon: HandCoins, exact: false }]
      : []),
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-b from-copper-100/80 to-copper-50 flex justify-center">
      <div className="w-full max-w-md min-h-screen flex flex-col shadow-xl bg-card border-x border-copper-200">
        <header className="sticky top-0 z-10 border-b border-copper-200 bg-card/95 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-copper-900">Portal Krama</p>
            <button
              type="button"
              onClick={logout}
              className="ml-auto text-muted hover:text-copper-900"
              title="Keluar"
            >
              <LogOut size={16} />
            </button>
          </div>
          <p className="text-[11px] text-muted mt-0.5">
            {user.kepalaNama} · {user.nomorKartu}
          </p>
        </header>

        <main className="flex-1 px-4 py-4">
          <Outlet />
        </main>

        <nav
          className={cn(
            "sticky bottom-0 border-t border-copper-200 bg-card grid text-center text-xs",
            nav.length <= 2
              ? "grid-cols-2"
              : nav.length === 3
                ? "grid-cols-3"
                : "grid-cols-4"
          )}
        >
          {nav.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "py-3 flex flex-col items-center gap-0.5 transition-colors",
                  active ? "text-copper-900 font-semibold bg-copper-50" : "text-muted hover:text-copper-800"
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
