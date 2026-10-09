import { formatRupiah } from "../../lib/dudukan-hitung";
import { cn } from "../../lib/utils";

type TrendItem = {
  label_pendek: string;
  label: string;
};

export function TrendBars({
  items,
  series,
  className,
}: {
  items: TrendItem[];
  series: {
    key: string;
    label: string;
    getValue: (item: TrendItem) => number;
    color: string;
  }[];
  className?: string;
}) {
  const max = Math.max(
    1,
    ...items.flatMap((item) => series.map((s) => s.getValue(item)))
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2 text-[11px]">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className={cn("inline-block w-2.5 h-2.5 rounded-sm", s.color)} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex items-end gap-1 h-36 border-b border-copper-100 pb-1">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex-1 min-w-0 flex flex-col items-center gap-0.5 h-full justify-end"
            title={item.label}
          >
            <div className="w-full flex items-end justify-center gap-px h-[calc(100%-1.25rem)]">
              {series.map((s) => {
                const value = s.getValue(item);
                const pct = Math.max(0, (value / max) * 100);
                return (
                  <div
                    key={s.key}
                    className={cn("flex-1 max-w-[14px] rounded-t transition-all", s.color)}
                    style={{ height: value > 0 ? `${Math.max(pct, 6)}%` : "2px" }}
                    title={`${s.label}: ${formatRupiah(value)}`}
                  />
                );
              })}
            </div>
            <span className="text-[9px] text-muted truncate w-full text-center leading-none">
              {item.label_pendek}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
