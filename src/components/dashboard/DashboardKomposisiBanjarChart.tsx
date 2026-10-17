import { UserCircle, Users, UserSquare } from "lucide-react";
import type { LaporanEksekutifBanjarKomposisi } from "../../lib/services/laporan-eksekutif";
import { cn } from "../../lib/utils";
import { Card } from "../ui/Card";

const COLORS = {
  mipil: "bg-teal-600",
  krama_tamiu: "bg-violet-600",
  tamiu: "bg-amber-600",
} as const;

export function DashboardKomposisiBanjarChart({
  items,
  className,
}: {
  items: LaporanEksekutifBanjarKomposisi[];
  className?: string;
}) {
  const rows = items
    .map((b) => ({
      ...b,
      total: b.mipil + b.krama_tamiu + b.tamiu,
    }))
    .filter((b) => b.total > 0);
  const max = Math.max(1, ...rows.map((r) => r.total));

  if (!rows.length) {
    return (
      <Card compact className={cn("!p-3", className)}>
        <p className="text-sm text-muted">Belum ada krama aktif per banjar.</p>
      </Card>
    );
  }

  return (
    <Card compact className={cn("!p-3 space-y-3", className)}>
      <div>
        <h4 className="text-sm font-semibold text-copper-950">Komposisi per banjar adat</h4>
        <p className="text-[11px] text-muted mt-0.5">
          Jumlah krama aktif — Mipil, Krama Tamiu, dan Tamiu (agregasi SQL)
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", COLORS.mipil)} />
          <Users size={11} className="text-teal-700" />
          Mipil
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", COLORS.krama_tamiu)} />
          <UserCircle size={11} className="text-violet-700" />
          Krama Tamiu
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", COLORS.tamiu)} />
          <UserSquare size={11} className="text-amber-700" />
          Tamiu
        </span>
      </div>

      <ul className="space-y-3">
        {rows.map((b) => {
          const mipilPct = (b.mipil / max) * 100;
          const ktPct = (b.krama_tamiu / max) * 100;
          const tamiuPct = (b.tamiu / max) * 100;
          return (
            <li key={b.banjar_id}>
              <div className="flex items-baseline justify-between gap-2 text-sm mb-1">
                <span className="truncate font-medium text-copper-900">
                  <span className="text-muted font-normal tabular-nums mr-1.5">
                    {b.banjar_kode}
                  </span>
                  {b.banjar_nama}
                </span>
                <span className="shrink-0 tabular-nums text-[11px] text-muted">
                  {b.total} krama
                </span>
              </div>
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-copper-100"
                title={`Mipil ${b.mipil} · KT ${b.krama_tamiu} · Tamiu ${b.tamiu}`}
              >
                {b.mipil > 0 && (
                  <div
                    className={cn("h-full transition-all", COLORS.mipil)}
                    style={{ width: `${mipilPct}%` }}
                  />
                )}
                {b.krama_tamiu > 0 && (
                  <div
                    className={cn("h-full transition-all", COLORS.krama_tamiu)}
                    style={{ width: `${ktPct}%` }}
                  />
                )}
                {b.tamiu > 0 && (
                  <div
                    className={cn("h-full transition-all", COLORS.tamiu)}
                    style={{ width: `${tamiuPct}%` }}
                  />
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-muted">
                <span>M {b.mipil}</span>
                <span>KT {b.krama_tamiu}</span>
                <span>T {b.tamiu}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
