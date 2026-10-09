import {
  formatStatusBayarDudukan,
  statusBayarDudukan,
  type DudukanStatusBayar,
} from "../../lib/dudukan-hitung";
import { cn } from "../../lib/utils";

const BADGE_BASE = "inline-block rounded px-1.5 py-0.5 text-[11px] leading-tight";

const STATUS_CLASS: Record<Exclude<DudukanStatusBayar, "tidak_wajib">, string> = {
  belum: "font-semibold bg-red-100 text-red-800",
  cicil: "font-medium bg-amber-100 text-amber-900",
  lunas: "font-semibold bg-green-100 text-green-800",
  lunas_keringanan: "font-semibold bg-violet-100 text-violet-900",
};

export function DudukanStatusBadge({
  tagihan,
  dibayar,
  keringanan = 0,
}: {
  tagihan: number;
  dibayar: number;
  keringanan?: number;
}) {
  const status = statusBayarDudukan(tagihan, dibayar, keringanan);
  const label = formatStatusBayarDudukan(tagihan, dibayar, keringanan);

  if (status === "tidak_wajib") {
    return <span className="text-muted">—</span>;
  }

  return (
    <span className={cn(BADGE_BASE, STATUS_CLASS[status])} title={label}>
      {label}
    </span>
  );
}
