import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { downloadExcel, type ExcelSheetInput } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import { formatRupiah, tahunSaatIni } from "../../lib/dudukan-hitung";
import { buildLaporanPlafonDanaDudukanPdfInput } from "../../lib/laporan-plafon-dana-dudukan-pdf";
import {
  formatPencapaianPlafon,
  getLaporanPlafonDanaDudukan,
  listAllTransaksiPlafonDanaDudukanGrouped,
  listTransaksiPlafonDanaDudukanPerPos,
  type LaporanPlafonDanaDudukan,
  type PengeluaranDanaDudukanPerPosRow,
} from "../../lib/services/laporan-plafon-dana-dudukan";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Input";
import { IconLink } from "../../components/ui/IconLink";
import {
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Filter,
  HandCoins,
  RotateCcw,
} from "lucide-react";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function keteranganTx(tx: PengeluaranDanaDudukanPerPosRow): string {
  const parts = [tx.transaksi_keterangan?.trim(), tx.pos_keterangan?.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

const PAGE_ID = "laporan/plafon-dana-dudukan";

export function LaporanPlafonDanaDudukanPage() {
  const isPhone = useIsPhoneClient();
  const tahunIni = tahunSaatIni();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Laporan Plafon Dana Dudukan");

  const [filterTahun, setFilterTahun] = usePersistedScalar(PAGE_ID, "filterTahun", String(tahunIni));
  const [laporan, setLaporan] = useState<LaporanPlafonDanaDudukan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedPos, setExpandedPos] = useState<Set<string>>(new Set());
  const [txCache, setTxCache] = useState<Map<string, PengeluaranDanaDudukanPerPosRow[]>>(new Map());
  const [txLoading, setTxLoading] = useState<Set<string>>(new Set());
  const [exportBusy, setExportBusy] = useState(false);

  const tahun = useMemo(() => {
    const n = Number(filterTahun);
    return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : tahunIni;
  }, [filterTahun, tahunIni]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setExpandedPos(new Set());
    setTxCache(new Map());
    try {
      const data = await getLaporanPlafonDanaDudukan(tahun);
      setLaporan(data);
    } catch (e) {
      setError(String(e));
      setLaporan(null);
    } finally {
      setLoading(false);
    }
  }, [tahun]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setFilterTahun(String(tahunIni));
  }

  async function togglePos(posBiayaId: string) {
    const next = new Set(expandedPos);
    if (next.has(posBiayaId)) {
      next.delete(posBiayaId);
      setExpandedPos(next);
      return;
    }
    next.add(posBiayaId);
    setExpandedPos(next);

    if (txCache.has(posBiayaId)) return;

    setTxLoading((prev) => new Set(prev).add(posBiayaId));
    try {
      const txs = await listTransaksiPlafonDanaDudukanPerPos(tahun, posBiayaId);
      setTxCache((prev) => new Map(prev).set(posBiayaId, txs));
    } catch (e) {
      window.alert(String(e));
      next.delete(posBiayaId);
      setExpandedPos(new Set(next));
    } finally {
      setTxLoading((prev) => {
        const s = new Set(prev);
        s.delete(posBiayaId);
        return s;
      });
    }
  }

  async function exportExcel() {
    if (!laporan?.rows.length) return;
    setExportBusy(true);
    try {
      const grouped = await listAllTransaksiPlafonDanaDudukanGrouped(tahun);
      const sheets: ExcelSheetInput[] = [
        {
          name: "Plafon",
          headers: ["Pos biaya", "%", "Plafon", "Terpakai", "Sisa", "Pencapaian"],
          rows: laporan.rows.map((r) => [
            r.pos_biaya_nama,
            r.persen,
            r.plafon,
            r.terpakai,
            r.sisa,
            r.pencapaian_pct ?? "",
          ]),
        },
      ];
      for (const pos of laporan.rows) {
        const txs = grouped.get(pos.pos_biaya_id) ?? [];
        sheets.push({
          name: pos.pos_biaya_nama.slice(0, 31),
          headers: ["Tanggal", "Akun", "Keterangan", "Jumlah"],
          rows: txs.map((tx) => [
            tx.tanggal,
            tx.akun_keuangan_nama,
            keteranganTx(tx),
            tx.jumlah,
          ]),
        });
      }
      await downloadExcel(`laporan-plafon-dana-dudukan-${tahun}`, sheets);
    } finally {
      setExportBusy(false);
    }
  }

  async function exportPdf() {
    if (!laporan?.rows.length) return;
    setExportBusy(true);
    try {
      const grouped = await listAllTransaksiPlafonDanaDudukanGrouped(tahun);
      openPdfPreview(buildLaporanPlafonDanaDudukanPdfInput(laporan, grouped));
    } finally {
      setExportBusy(false);
    }
  }

  const rows = laporan?.rows ?? [];

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <HandCoins className="text-copper-700 shrink-0" size={22} />
            Laporan Plafon Dana Dudukan
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Pencapaian alokasi pengeluaran per pos — plafon dihitung dari penerimaan dudukan tahun
            kalender.
          </p>
        </div>
        <IconLink to="/laporan" icon={ArrowLeft}>
          Kembali ke Laporan
        </IconLink>
      </div>

      <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, "mt-4")}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-28">
            <Label className="text-[11px]">Tahun</Label>
            <Input
              type="number"
              min={2000}
              max={2100}
              value={filterTahun}
              onChange={(e) => setFilterTahun(e.target.value)}
              className={cn("text-sm", isPhone ? "h-11" : "h-9")}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className={cn("text-xs", isPhone ? "h-11" : "h-9")}
            icon={Filter}
            onClick={() => void load()}
          >
            Terapkan
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={cn("text-xs", isPhone ? "h-11" : "h-9")}
            icon={RotateCcw}
            onClick={resetFilters}
          >
            Reset
          </Button>
          <span className="ml-auto">
            <LaporanExportButtons
              onExcel={() => void exportExcel()}
              onPdf={() => void exportPdf()}
              disabled={!rows.length}
              busy={exportBusy}
            />
          </span>
        </div>
      </Card>

      {laporan && !loading && (
        <div className={cn("flex flex-wrap gap-2 mt-3", isPhone && "gap-1.5")}>
          <StatChip label="Penerimaan dudukan" value={formatRupiah(laporan.total_penerimaan)} />
          <StatChip label="Total terpakai" value={formatRupiah(laporan.total_terpakai)} />
          <StatChip label="Total sisa plafon" value={formatRupiah(laporan.total_sisa)} />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2 mt-3">{error}</p>
      )}

      {loading && <p className="text-sm text-muted mt-4">Memuat laporan…</p>}

      {!loading && rows.length > 0 && (
        <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, "mt-4 overflow-x-auto")}>
          <table className={cn(LAPORAN_TABLE, LAPORAN_TABLE_ELEMENT)}>
            <thead>
              <tr className={LAPORAN_HEAD_ROW}>
                <th className="w-8" aria-label="Buka rincian" />
                <th>Pos biaya</th>
                <th className="text-right">%</th>
                <th className="text-right">Plafon</th>
                <th className="text-right">Terpakai</th>
                <th className="text-right">Sisa</th>
                <th className="text-right">Pencapaian</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = expandedPos.has(r.pos_biaya_id);
                const txs = txCache.get(r.pos_biaya_id);
                const loadingTx = txLoading.has(r.pos_biaya_id);
                const melebihi = r.sisa < 0;
                const pct = r.pencapaian_pct;
                return (
                  <Fragment key={r.pos_biaya_id}>
                    <tr className="border-b border-copper-100">
                      <td className="py-1.5">
                        <button
                          type="button"
                          className={cn(
                            "rounded hover:bg-copper-100 text-copper-800",
                            isPhone ? "min-h-11 min-w-11 p-2 flex items-center justify-center" : "p-1"
                          )}
                          aria-expanded={open}
                          aria-label={open ? "Tutup rincian" : "Buka rincian pengeluaran"}
                          onClick={() => void togglePos(r.pos_biaya_id)}
                        >
                          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </td>
                      <td className="font-medium">{r.pos_biaya_nama}</td>
                      <td className="text-right tabular-nums">{r.persen}%</td>
                      <td className="text-right tabular-nums">{formatRupiah(r.plafon)}</td>
                      <td className="text-right tabular-nums">{formatRupiah(r.terpakai)}</td>
                      <td
                        className={cn(
                          "text-right tabular-nums font-medium",
                          melebihi ? "text-red-700" : r.sisa < r.plafon * 0.1 ? "text-amber-800" : ""
                        )}
                      >
                        {formatRupiah(r.sisa)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatPencapaianPlafon(pct)}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={7} className="bg-copper-50/50 px-2 py-2">
                          {loadingTx ? (
                            <p className="text-xs text-muted py-2 pl-6">Memuat transaksi…</p>
                          ) : txs && txs.length > 0 ? (
                            <table className="w-full text-xs ml-6 max-w-4xl">
                              <thead>
                                <tr className="text-muted border-b border-copper-200">
                                  <th className="text-left py-1 pr-2 font-medium">Tanggal</th>
                                  <th className="text-left py-1 pr-2 font-medium">Akun</th>
                                  <th className="text-left py-1 pr-2 font-medium">Keterangan</th>
                                  <th className="text-right py-1 font-medium">Jumlah</th>
                                </tr>
                              </thead>
                              <tbody>
                                {txs.map((tx, i) => (
                                  <tr key={`${tx.transaksi_id}-${i}`} className="border-b border-copper-100/80">
                                    <td className="py-1 pr-2 whitespace-nowrap">
                                      {formatTanggalLahir(tx.tanggal)}
                                    </td>
                                    <td className="py-1 pr-2">{tx.akun_keuangan_nama}</td>
                                    <td className="py-1 pr-2">{keteranganTx(tx)}</td>
                                    <td className="py-1 text-right tabular-nums">{formatRupiah(tx.jumlah)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-muted py-2 pl-6">Belum ada pengeluaran untuk pos ini.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {laporan && (
              <tfoot>
                <tr className="font-semibold border-t-2 border-copper-300 bg-copper-50/80">
                  <td />
                  <td>Jumlah</td>
                  <td className="text-right tabular-nums">100%</td>
                  <td className="text-right tabular-nums">{formatRupiah(laporan.total_penerimaan)}</td>
                  <td className="text-right tabular-nums">{formatRupiah(laporan.total_terpakai)}</td>
                  <td className="text-right tabular-nums">{formatRupiah(laporan.total_sisa)}</td>
                  <td className="text-right tabular-nums">
                    {laporan.total_penerimaan > 0
                      ? formatPencapaianPlafon(
                          Math.round((laporan.total_terpakai / laporan.total_penerimaan) * 1000) / 10
                        )
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="text-[10px] text-muted mt-2 leading-snug">
            Klik panah di kiri baris pos untuk melihat rincian transaksi pengeluaran. Plafon = penerimaan
            dudukan × persentase alokasi (Master Keuangan).
          </p>
        </Card>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-muted mt-4">Tidak ada data alokasi Dana Dudukan.</p>
      )}
    </div>
  );
}
