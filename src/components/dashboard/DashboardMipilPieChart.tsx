import { cn } from "../../lib/utils";
import { compareJenisKramaNama } from "../../lib/services/laporan-rekap-krama";

const PIE_COLORS = [
  "#b45309",
  "#d97706",
  "#92400e",
  "#78350f",
  "#c2410c",
  "#9a3412",
  "#a16207",
  "#ea580c",
  "#f59e0b",
  "#78716c",
];

export type MipilPieSlice = {
  label: string;
  value: number;
};

export function DashboardMipilPieChart({
  items,
  className,
}: {
  items: MipilPieSlice[];
  className?: string;
}) {
  const slices = [...items]
    .sort((a, b) => compareJenisKramaNama("MIPIL", a.label, b.label))
    .filter((i) => i.value > 0);
  const total = slices.reduce((s, i) => s + i.value, 0);

  if (!slices.length || total === 0) {
    return <p className="text-sm text-muted">Belum ada Krama Mipil aktif.</p>;
  }

  let cumulative = 0;
  const segments = slices.map((slice, idx) => {
    const pct = (slice.value / total) * 100;
    const start = cumulative;
    cumulative += pct;
    return {
      ...slice,
      pct,
      start,
      end: cumulative,
      color: PIE_COLORS[idx % PIE_COLORS.length],
    };
  });

  const gradient = segments
    .map((s) => `${s.color} ${s.start.toFixed(2)}% ${s.end.toFixed(2)}%`)
    .join(", ");

  return (
    <div className={cn("flex flex-col sm:flex-row gap-4 items-center sm:items-start", className)}>
      <div className="relative shrink-0 w-36 h-36">
        <div
          className="w-full h-full rounded-full"
          style={{ background: `conic-gradient(${gradient})` }}
          role="img"
          aria-label={`Komposisi jenis Krama Mipil, total ${total}`}
        />
        <div className="absolute inset-[22%] rounded-full bg-card border border-copper-100 flex flex-col items-center justify-center shadow-inner">
          <span className="text-xl font-bold tabular-nums text-copper-950">{total}</span>
          <span className="text-[10px] text-muted">Mipil</span>
        </div>
      </div>

      <ul className="flex-1 min-w-0 space-y-1.5 w-full">
        {segments.map((s) => (
          <li key={s.label} className="flex items-start gap-2 text-xs">
            <span
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-copper-900 leading-snug">{s.label}</p>
              <p className="text-muted tabular-nums">
                <span className="font-semibold text-copper-950">{s.value}</span>
                {" · "}
                {Math.round(s.pct)}%
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
