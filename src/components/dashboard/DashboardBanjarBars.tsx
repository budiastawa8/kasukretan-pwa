import { cn } from "../../lib/utils";

export function DashboardBanjarBars({
  items,
  className,
}: {
  items: { label: string; count: number }[];
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((s, i) => s + i.count, 0);

  if (!items.length) {
    return <p className="text-sm text-muted">Belum ada data banjar / krama</p>;
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      {items.map((b) => {
        const pct = (b.count / max) * 100;
        const share = total > 0 ? Math.round((b.count / total) * 100) : 0;
        return (
          <div key={b.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm mb-1">
              <span className="truncate text-copper-900">{b.label}</span>
              <span className="shrink-0 tabular-nums font-semibold text-copper-950">
                {b.count}
                <span className="text-muted font-normal text-[11px] ml-1">({share}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-copper-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-copper-500 to-copper-700 transition-all"
                style={{ width: `${Math.max(b.count > 0 ? 4 : 0, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
