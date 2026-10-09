import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "../../lib/dudukan-hitung";
import {
  getPlafonAlokasiDudukan,
  tahunDariTanggal,
} from "../../lib/services/kas-dudukan-alokasi";
import type { PlafonAlokasiDudukanRow } from "../../lib/types";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";

type PosLine = { posBiayaId: string; jumlah: number };

export function KasDudukanPlafonPanel({
  akunKeuanganId,
  tanggal,
  baris,
  excludeTransaksiId,
}: {
  akunKeuanganId: string;
  tanggal: string;
  baris: PosLine[];
  excludeTransaksiId?: string | null;
}) {
  const isPhone = useIsPhoneClient();
  const [loading, setLoading] = useState(true);
  const [totalPenerimaan, setTotalPenerimaan] = useState(0);
  const [rows, setRows] = useState<PlafonAlokasiDudukanRow[]>([]);
  const [loadError, setLoadError] = useState("");

  const tahun = useMemo(() => {
    try {
      return tahunDariTanggal(tanggal);
    } catch {
      return new Date().getFullYear();
    }
  }, [tanggal]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void getPlafonAlokasiDudukan(akunKeuanganId, tahun, excludeTransaksiId ?? undefined)
      .then((data) => {
        if (cancelled) return;
        setTotalPenerimaan(data.total_penerimaan);
        setRows(data.rows);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [akunKeuanganId, tahun, excludeTransaksiId]);

  const draftByPos = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of baris) {
      if (!b.posBiayaId) continue;
      const j = Math.round(Number(b.jumlah) || 0);
      if (j <= 0) continue;
      m.set(b.posBiayaId, (m.get(b.posBiayaId) ?? 0) + j);
    }
    return m;
  }, [baris]);

  if (loading && rows.length === 0) {
    return <p className="text-xs text-muted">Memuat plafon alokasi…</p>;
  }

  if (loadError) {
    return (
      <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">{loadError}</p>
    );
  }

  return (
    <div className="rounded-lg border border-copper-200 bg-copper-50/40 p-3 space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          Plafon tahun <strong>{tahun}</strong>
        </span>
        <span>
          Penerimaan dudukan: <strong className="tabular-nums">{formatRupiah(totalPenerimaan)}</strong>
        </span>
      </div>
      {isPhone ? (
        <ul className="space-y-2">
          {rows.map((r) => {
            const draft = draftByPos.get(r.pos_biaya_id) ?? 0;
            const sisaSetelah = r.sisa - draft;
            const melebihi = sisaSetelah < 0;
            return (
              <li
                key={r.pos_biaya_id}
                className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-copper-950">{r.pos_biaya_nama}</p>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">{r.persen}%</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div>
                    <dt className="text-muted">Plafon</dt>
                    <dd className="tabular-nums font-medium text-copper-900">{formatRupiah(r.plafon)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Terpakai</dt>
                    <dd className="tabular-nums text-copper-900">{formatRupiah(r.terpakai)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Draft</dt>
                    <dd className="tabular-nums text-copper-900">
                      {draft > 0 ? formatRupiah(draft) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Sisa</dt>
                    <dd
                      className={cn(
                        "tabular-nums font-semibold",
                        melebihi ? "text-red-700" : sisaSetelah < r.plafon * 0.1 ? "text-amber-800" : "text-copper-950"
                      )}
                    >
                      {formatRupiah(sisaSetelah)}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-copper-200">
                <th className="pr-2 py-1 font-medium">Pos</th>
                <th className="pr-2 py-1 text-right font-medium">%</th>
                <th className="pr-2 py-1 text-right font-medium">Plafon</th>
                <th className="pr-2 py-1 text-right font-medium">Terpakai</th>
                <th className="pr-2 py-1 text-right font-medium">Draft</th>
                <th className="py-1 text-right font-medium">Sisa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const draft = draftByPos.get(r.pos_biaya_id) ?? 0;
                const sisaSetelah = r.sisa - draft;
                const melebihi = sisaSetelah < 0;
                return (
                  <tr key={r.pos_biaya_id} className="border-b border-copper-100/80">
                    <td className="pr-2 py-1">{r.pos_biaya_nama}</td>
                    <td className="pr-2 py-1 text-right tabular-nums">{r.persen}%</td>
                    <td className="pr-2 py-1 text-right tabular-nums">{formatRupiah(r.plafon)}</td>
                    <td className="pr-2 py-1 text-right tabular-nums">{formatRupiah(r.terpakai)}</td>
                    <td className="pr-2 py-1 text-right tabular-nums">
                      {draft > 0 ? formatRupiah(draft) : "—"}
                    </td>
                    <td
                      className={cn(
                        "py-1 text-right tabular-nums font-medium",
                        melebihi ? "text-red-700" : sisaSetelah < r.plafon * 0.1 ? "text-amber-800" : ""
                      )}
                    >
                      {formatRupiah(sisaSetelah)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-muted leading-snug">
        Pengeluaran Dana Dudukan hanya boleh memakai pos alokasi di atas. Plafon dihitung dari penerimaan
        dudukan tahun kalender yang sama.
      </p>
    </div>
  );
}
