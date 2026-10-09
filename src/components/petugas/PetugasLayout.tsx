import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { ArrowLeft, ClipboardList, HandCoins, Home, LogOut, Wallet } from "lucide-react";
import { usePetugasAuth } from "../../context/PetugasAuthContext";
import { isDesktopApp } from "../../lib/runtime";
import { cn } from "../../lib/utils";
import "../../styles/petugas-module.css";

const NAV_ICON_SIZE = 22;

const NAV = [
  { to: "/petugas", label: "Beranda", icon: Home, exact: true },
  { to: "/petugas/rekap-hari-ini", label: "Rekap", icon: ClipboardList },
  { to: "/petugas/paturunan", label: "Paturunan", icon: Wallet },
  { to: "/petugas/dudukan", label: "Dudukan", icon: HandCoins },
] as const;

export function PetugasLayout() {
  const { pathname } = useLocation();
  const { user, logout } = usePetugasAuth();

  if (!user) {
    return <Navigate to="/petugas/login" replace />;
  }
  if (user.peran !== "petugas" && user.peran !== "admin") {
    return <Navigate to="/petugas/login" replace state={{ error: "Akun tidak berhak akses mode petugas" }} />;
  }

  return (
    <div className="petugas-module min-h-screen bg-copper-200 flex justify-center">
      <div className="w-full max-w-md min-h-screen flex flex-col shadow-xl bg-white border-x border-copper-300">
        <header className="sticky top-0 z-10 border-b border-copper-300 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            {isDesktopApp() ? (
              <>
                <Link
                  to="/"
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-copper-900"
                  title="Kembali ke admin"
                >
                  <ArrowLeft size={14} />
                  Admin
                </Link>
                <span className="text-muted">·</span>
              </>
            ) : null}
            <p className="text-sm font-semibold text-copper-900">Mode Petugas</p>
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
            {user.nama ?? user.username} · database online
          </p>
        </header>

        <main className="flex-1 px-4 py-4">
          <Outlet />
        </main>

        <nav className="sticky bottom-0 border-t border-copper-300 bg-white grid grid-cols-4 text-center text-xs">
          {NAV.map((item) => {
            const active =
              "exact" in item && item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "py-3 flex flex-col items-center gap-1 transition-colors",
                  active
                    ? "text-copper-950 font-semibold bg-copper-100 border-t-2 border-copper-600"
                    : "text-muted hover:text-copper-800"
                )}
              >
                <Icon size={NAV_ICON_SIZE} strokeWidth={active ? 2.25 : 2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
