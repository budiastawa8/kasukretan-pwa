import { UserCircle, UserSquare } from "lucide-react";
import { cn } from "../../lib/utils";

export type PemasihBanjarRow = {
  label: string;
  krama_tamiu: number;
  tamiu: number;
};

export function DashboardPemasihBanjarBars({
  items,
  className,
}: {
  items: PemasihBanjarRow[];
  className?: string;
}) {
  const shown = items.filter((i) => i.krama_tamiu > 0 || i.tamiu > 0);
  const max = Math.max(1, ...shown.map((i) => Math.max(i.krama_tamiu, i.tamiu)));

  if (!shown.length) {
    return <p className="text-sm text-muted">Belum ada Pemasih aktif per banjar.</p>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <UserCircle size={12} className="text-copper-700" />
          Krama Tamiu
        </span>
        <span className="inline-flex items-center gap-1">
          <UserSquare size={12} className="text-amber-700" />
          Tamiu
        </span>
      </div>
      {shown.map((b) => (
        <div key={b.label}>
          <p className="text-sm font-medium text-copper-900 mb-1 truncate">{b.label}</p>
          <div className="space-y-1">
            <BarRow
              label="Krama Tamiu"
              value={b.krama_tamiu}
              max={max}
              barClass="bg-gradient-to-r from-copper-500 to-copper-700"
            />
            <BarRow
              label="Tamiu"
              value={b.tamiu}
              max={max}
              barClass="bg-gradient-to-r from-amber-500 to-amber-700"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  barClass,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
}) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[10px] text-muted truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-copper-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barClass)}
          style={{ width: `${Math.max(value > 0 ? 4 : 0, pct)}%` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums text-copper-950">
        {value}
      </span>
    </div>
  );
}
