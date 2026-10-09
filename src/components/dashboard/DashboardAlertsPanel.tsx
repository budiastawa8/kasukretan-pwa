import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  AlertTriangle,
  Coins,
  HandCoins,
} from "lucide-react";
import { PEMASIH_PERINGATAN_HARI } from "../../lib/pemasih-perhatian";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { cn } from "../../lib/utils";
import { Card } from "../ui/Card";

type AlertItem = {
  id: string;
  icon: LucideIcon;
  tone: "copper" | "amber" | "violet";
  title: string;
  href: string;
  linkLabel: string;
};

const TONE = {
  copper: {
    row: "hover:bg-copper-50/80",
    icon: "text-copper-700 bg-copper-100",
  },
  amber: {
    row: "hover:bg-amber-50/80",
    icon: "text-amber-800 bg-amber-100",
  },
  violet: {
    row: "hover:bg-violet-50/80",
    icon: "text-violet-800 bg-violet-100",
  },
} as const;

function AlertRow({ item }: { item: AlertItem }) {
  const tone = TONE[item.tone];
  const Icon = item.icon;

  return (
    <li>
      <Link
        to={item.href}
        className={cn(
          "flex items-start gap-2.5 px-3 py-2.5 transition-colors",
          tone.row
        )}
      >
        <span className={cn("rounded-md p-1.5 shrink-0", tone.icon)}>
          <Icon size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-copper-950 leading-snug">
            {item.title}
          </span>
          <span className="block text-[11px] text-copper-700 mt-0.5 underline underline-offset-2">
            {item.linkLabel}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function DashboardAlertsPanel({
  desaOk,
  akanHabis,
  tidakAktif,
  tunggakanPaturunan,
  tunggakanPaturunanSisa,
  tunggakanDudukan,
  tunggakanDudukanSisa,
  className,
}: {
  desaOk: boolean;
  akanHabis: number;
  tidakAktif: number;
  tunggakanPaturunan: number;
  tunggakanPaturunanSisa: number;
  tunggakanDudukan: number;
  tunggakanDudukanSisa: number;
  className?: string;
}) {
  const items: AlertItem[] = [];

  if (!desaOk) {
    items.push({
      id: "desa",
      icon: AlertCircle,
      tone: "copper",
      title: "Konfigurasi desa adat belum lengkap",
      href: "/pengaturan",
      linkLabel: "Buka Pengaturan",
    });
  }
  if (akanHabis > 0) {
    items.push({
      id: "akan-habis",
      icon: AlertTriangle,
      tone: "amber",
      title: `${akanHabis} pemasih akan habis dalam ${PEMASIH_PERINGATAN_HARI} hari`,
      href: "/krama-pemasih/perhatian?filter=akan-habis",
      linkLabel: "Daftar perpanjangan",
    });
  }
  if (tidakAktif > 0) {
    items.push({
      id: "tidak-aktif",
      icon: AlertTriangle,
      tone: "amber",
      title: `${tidakAktif} pemasih tidak aktif`,
      href: "/krama-pemasih/perhatian?filter=tidak-aktif",
      linkLabel: "Tindak lanjut perhatian",
    });
  }
  if (tunggakanPaturunan > 0) {
    items.push({
      id: "tunggakan-paturunan",
      icon: Coins,
      tone: "violet",
      title: `${tunggakanPaturunan} krama tunggak paturunan (${formatRupiah(tunggakanPaturunanSisa)})`,
      href: "/laporan/tunggakan-paturunan",
      linkLabel: "Laporan tunggakan paturunan",
    });
  }
  if (tunggakanDudukan > 0) {
    items.push({
      id: "tunggakan-dudukan",
      icon: HandCoins,
      tone: "amber",
      title: `${tunggakanDudukan} krama tunggak dudukan (${formatRupiah(tunggakanDudukanSisa)})`,
      href: "/laporan/tunggakan-dudukan",
      linkLabel: "Laporan tunggakan dudukan",
    });
  }

  if (items.length === 0) return null;

  return (
    <Card
      className={cn(
        "!p-0 overflow-hidden border-amber-200/70 shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-amber-100 bg-amber-50/70 px-3 py-2">
        <h3 className="text-xs font-semibold text-amber-950 flex items-center gap-1.5">
          <AlertTriangle size={14} className="shrink-0" />
          Perlu perhatian
        </h3>
        <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-950">
          {items.length}
        </span>
      </div>
      <ul className="divide-y divide-copper-100/80">
        {items.map((item) => (
          <AlertRow key={item.id} item={item} />
        ))}
      </ul>
    </Card>
  );
}
