import {
  formatStatusBayarPaturunan,
  statusBayarPaturunan,
  type PaturunanStatusBayar,
} from "../../lib/paturunan-hitung";
import { cn } from "../../lib/utils";

const BADGE_BASE = "inline-block rounded px-1.5 py-0.5 text-[11px] leading-tight";

const STATUS_CLASS: Record<Exclude<PaturunanStatusBayar, "tidak_wajib">, string> = {
  belum: "font-semibold bg-red-100 text-red-800",
  cicil: "font-medium bg-amber-100 text-amber-900",
  cicil_punia: "font-medium bg-amber-50 text-amber-900 ring-1 ring-violet-200",
  lunas: "font-semibold bg-green-100 text-green-800",
  lunas_punia: "font-semibold bg-sky-200 text-sky-900",
  punia: "font-medium bg-violet-50 text-violet-800",
};

export function PaturunanStatusBadge({
  tagihan,
  dibayarWajib,
  punia,
}: {
  tagihan: number;
  dibayarWajib: number;
  punia: number;
}) {
  const status = statusBayarPaturunan(tagihan, dibayarWajib, punia);
  const label = formatStatusBayarPaturunan(tagihan, dibayarWajib, punia);

  if (status === "tidak_wajib") {
    return <span className="text-muted">—</span>;
  }

  return (
    <span className={cn(BADGE_BASE, STATUS_CLASS[status])} title={label}>
      {label}
    </span>
  );
}
