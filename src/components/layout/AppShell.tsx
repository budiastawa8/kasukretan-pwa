import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { DESA_ADAT_UPDATED_EVENT, getDesaAdat } from "../../lib/services/desa";
import { runBatchSyncStatusIlikitaBackground } from "../../lib/services/krama";
import { runSyncNyadaOtomatisBackground } from "../../lib/services/nyada-otomatis";
import { APP_MAIN_SCROLL_ID } from "../../lib/scroll-main";
import { canAccessPath, isPetugasLapangan, staffRoleLabel } from "../../lib/auth-roles";
import { canUseStaffApp } from "../../lib/runtime";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { GuardedNavLink } from "./GuardedNavLink";
import {
  LayoutDashboard,
  Users,
  Coins,
  UserCircle,
  HandCoins,
  Wallet,
  BarChart3,
  Building2,
  Settings,
  Database,
  LogOut,
  Menu,
  X,
  MoreHorizontal,
  ScanLine,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/Button";
import { UkuranTulisanControl } from "../ui/UkuranTulisanControl";
import { AdminBackupReminderBanner } from "../settings/AdminBackupReminderBanner";
import { SetoranTelatPetugasBanner } from "../setoran/SetoranTelatBanner";
import { CloudSyncBanner } from "../settings/CloudSyncBanner";
import { TrialLicenseBanner } from "../settings/TrialLicenseBanner";
import { InstallAppBanner } from "../pwa/InstallAppBanner";
import { APP_CREDITS, appCopyrightLine } from "../../lib/app-credits";
import { cn } from "../../lib/utils";

type NavItem = {
  to: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  end?: boolean;
};

type NavGroup = {
  id: string;
  label?: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    items: [{ to: "/", icon: LayoutDashboard, label: "Dashboard", end: true }],
  },
  {
    id: "krama",
    label: "Krama",
    items: [
      { to: "/krama-mipil", icon: Users, label: "Pipil" },
      { to: "/krama-pemasih", icon: UserCircle, label: "Pemasih" },
    ],
  },
  {
    id: "iuran",
    label: "Iuran",
    items: [
      { to: "/pungut", icon: ScanLine, label: "Pengumpulan", end: true },
      { to: "/pungut/rekap", icon: ClipboardList, label: "Rekap & Riwayat" },
      { to: "/paturunan", icon: Coins, label: "Paturunan" },
      { to: "/dudukan", icon: HandCoins, label: "Dudukan" },
    ],
  },
  {
    id: "ops",
    label: "Operasional",
    items: [
      { to: "/keuangan", icon: Wallet, label: "Keuangan" },
      { to: "/lembaga-badan", icon: Building2, label: "Lembaga" },
      { to: "/laporan", icon: BarChart3, label: "Laporan" },
    ],
  },
  {
    id: "sistem",
    label: "Sistem",
    items: [
      { to: "/master", icon: Database, label: "Master" },
      { to: "/pengaturan", icon: Settings, label: "Pengaturan" },
    ],
  },
];

/** Shortcut bawah HP — sisanya lewat tombol Menu. */
const PHONE_DOCK_PATHS = ["/", "/pungut", "/krama-mipil", "/krama-pemasih", "/paturunan"] as const;

function SidebarNav({
  peran,
  onNavigate,
}: {
  peran: string | undefined;
  onNavigate?: () => void;
}) {
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => canAccessPath(peran, item.to)),
      })).filter((g) => g.items.length > 0),
    [peran]
  );

  return (
    <nav className="flex-1 space-y-3 overflow-y-auto p-2.5">
      {groups.map((group) => (
        <div key={group.id} className="space-y-1">
          {group.label && (
            <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-copper-500">
              {group.label}
            </p>
          )}
          {group.items.map(({ to, icon, label, end }) => (
            <GuardedNavLink
              key={to}
              to={to}
              end={end}
              icon={icon}
              label={label}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarChrome({
  namaDesaAdat,
  userLabel,
  peranLabel,
  onLogout,
  onNavigate,
  peran,
}: {
  namaDesaAdat: string;
  userLabel: string;
  peranLabel: string;
  onLogout: () => void;
  onNavigate?: () => void;
  peran: string | undefined;
}) {
  return (
    <>
      <div className="border-b border-copper-800/60 px-4 py-3.5">
        <h1 className="text-base font-bold leading-tight tracking-tight text-copper-100">
          Kasukretan
        </h1>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-copper-400">
          Desa Adat{" "}
          {namaDesaAdat || <span className="italic text-copper-500">belum diatur</span>}
        </p>
      </div>
      <SidebarNav peran={peran} onNavigate={onNavigate} />
      <div className="shrink-0 border-t border-copper-800/60 p-3">
        <p className="truncate text-sm text-copper-300">{userLabel}</p>
        <p className="text-xs text-copper-500">{peranLabel}</p>
        <div className="mt-2">
          <UkuranTulisanControl tone="dark" />
        </div>
        <Button
          type="button"
          variant="ghost"
          icon={LogOut}
          onClick={onLogout}
          className="mt-2 w-full justify-start text-copper-300 hover:bg-copper-800/40 hover:text-red-300"
        >
          Keluar
        </Button>
        <p className="mt-2 text-[10px] leading-snug text-copper-600">
          <a
            href={APP_CREDITS.website}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-copper-400"
            title={APP_CREDITS.website}
          >
            {appCopyrightLine()}
          </a>
        </p>
      </div>
    </>
  );
}

function PhoneBottomDock({
  peran,
  onOpenMenu,
}: {
  peran: string | undefined;
  onOpenMenu: () => void;
}) {
  const dockItems = useMemo(() => {
    const flat = NAV_GROUPS.flatMap((g) => g.items);
    return PHONE_DOCK_PATHS.map((path) => flat.find((i) => i.to === path)).filter(
      (i): i is NavItem => Boolean(i && canAccessPath(peran, i.to))
    );
  }, [peran]);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-copper-200 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(61,35,16,0.08)] backdrop-blur print:hidden"
      aria-label="Navigasi utama"
    >
      {dockItems.map(({ to, icon, label, end }) => (
        <GuardedNavLink
          key={to}
          to={to}
          end={end}
          icon={icon}
          label={label}
          layout="dock"
        />
      ))}
      <button
        type="button"
        className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium text-copper-600 hover:text-copper-900"
        onClick={onOpenMenu}
      >
        <MoreHorizontal size={20} strokeWidth={2} />
        <span>Menu</span>
      </button>
    </nav>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const isPhone = useIsPhoneClient();
  const [namaDesaAdat, setNamaDesaAdat] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname, search } = useLocation();

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
    setMobileOpen(false);
  }, [pathname, search]);

  useEffect(() => {
    const load = () => {
      void getDesaAdat().then((d) => setNamaDesaAdat(d?.nama_desa_adat?.trim() ?? ""));
    };
    load();
    window.addEventListener(DESA_ADAT_UPDATED_EVENT, load);
    return () => window.removeEventListener(DESA_ADAT_UPDATED_EVENT, load);
  }, []);

  useEffect(() => {
    if (canUseStaffApp() && !isPetugasLapangan(user?.peran)) {
      runBatchSyncStatusIlikitaBackground();
      runSyncNyadaOtomatisBackground();
    }
  }, [user?.peran]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const userLabel = user?.nama ?? user?.username ?? "";
  const peranLabel = staffRoleLabel(user?.peran);
  const pageTitle =
    NAV_GROUPS.flatMap((g) => g.items).find((i) =>
      i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`)
    )?.label ?? "Kasukretan";

  return (
    <div className="flex h-screen overflow-hidden" data-shell={isPhone ? "phone" : "desktop"}>
      {/* Desktop / tablet sidebar — jangan pakai md: agar Chrome "Situs desktop" di HP tidak memaksa sidebar */}
      <aside
        className={cn(
          "h-full w-52 shrink-0 flex-col border-r border-copper-800/50 bg-sidebar text-sidebar-foreground shadow-md shadow-copper-950/15 print:hidden lg:w-56",
          isPhone ? "hidden" : "flex"
        )}
      >
        <SidebarChrome
          namaDesaAdat={namaDesaAdat}
          userLabel={userLabel}
          peranLabel={peranLabel}
          onLogout={logout}
          peran={user?.peran}
        />
      </aside>

      {/* Drawer HP */}
      <div
        className={cn(
          "fixed inset-0 z-40 print:hidden",
          isPhone ? (mobileOpen ? "pointer-events-auto" : "pointer-events-none") : "hidden"
        )}
        aria-hidden={!mobileOpen || !isPhone}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-copper-950/50 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
          aria-label="Tutup menu"
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between border-b border-copper-800/60 px-3 py-2">
            <span className="text-sm font-semibold text-copper-100">Menu</span>
            <button
              type="button"
              className="rounded-md p-2 text-copper-300 hover:bg-copper-800/50 hover:text-white"
              aria-label="Tutup"
              onClick={() => setMobileOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <SidebarChrome
            namaDesaAdat={namaDesaAdat}
            userLabel={userLabel}
            peranLabel={peranLabel}
            onLogout={logout}
            onNavigate={() => setMobileOpen(false)}
            peran={user?.peran}
          />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {isPhone ? (
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-copper-200 bg-card/95 px-3 py-2 backdrop-blur print:hidden">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-copper-950">{pageTitle}</p>
              <p className="truncate text-[10px] text-muted">
                {namaDesaAdat ? `Desa Adat ${namaDesaAdat}` : "Desa belum diatur"}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-copper-200 bg-copper-50 text-copper-900"
              aria-label="Buka menu lengkap"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
          </header>
        ) : null}

        <main
          id={APP_MAIN_SCROLL_ID}
          ref={mainRef}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain",
            isPhone && "pb-[calc(3.75rem+env(safe-area-inset-bottom))]"
          )}
        >
          <div
            className={cn(
              "app-main mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-5 sm:py-4",
              isPhone && "px-3 py-2.5"
            )}
          >
            <TrialLicenseBanner />
            <AdminBackupReminderBanner />
            <SetoranTelatPetugasBanner />
            <CloudSyncBanner />
            <InstallAppBanner isPhone={isPhone} />
            <Outlet />
          </div>
        </main>

        {isPhone ? (
          <PhoneBottomDock peran={user?.peran} onOpenMenu={() => setMobileOpen(true)} />
        ) : null}
      </div>
    </div>
  );
}
