import type { ComponentType } from "react";
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
  ScanLine,
  ClipboardList,
} from "lucide-react";
import { canAccessPath } from "../../lib/auth-roles";

export type NavItem = {
  to: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  end?: boolean;
};

export type NavGroup = {
  id: string;
  label?: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
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
      { to: "/pengumpulan", icon: ScanLine, label: "Pengumpulan", end: true },
      { to: "/pengumpulan/rekap", icon: ClipboardList, label: "Rekap & Riwayat" },
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

/** Shortcut bawah HP — sisanya lewat grid dashboard / tombol Menu. */
export const PHONE_DOCK_PATHS = ["/", "/pengumpulan"] as const;

export function navGroupsForPeran(peran: string | undefined): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => canAccessPath(peran, item.to)),
  })).filter((g) => g.items.length > 0);
}

export function findNavLabel(pathname: string): string | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) =>
    i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`)
  )?.label;
}
