import type { LaporanEksekutifJenisKrama } from "../../lib/services/laporan-eksekutif";

export function JenisKramaBreakdownTable({
  title,
  total,
  rows,
}: {
  title: string;
  total: number;
  rows: LaporanEksekutifJenisKrama[];
}) {
  const shown = rows.filter((r) => r.jumlah_krama > 0);

  return (
    <div className="min-w-0 rounded-lg border border-copper-100 bg-copper-50/30 p-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <h4 className="text-xs font-semibold text-copper-900">{title}</h4>
        <span className="text-[11px] font-bold tabular-nums text-copper-800">{total}</span>
      </div>
      {shown.length === 0 ? (
        <p className="text-[11px] text-muted">Belum ada krama aktif.</p>
      ) : (
        <table className="w-full text-[11px]">
          <tbody>
            {shown.map((r) => (
              <tr key={r.jenis_id || r.jenis_nama} className="border-b border-copper-100/80 last:border-0">
                <td className="py-1 pr-2 text-copper-900">{r.jenis_nama}</td>
                <td className="py-1 text-right tabular-nums font-medium text-copper-950">
                  {r.jumlah_krama}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
