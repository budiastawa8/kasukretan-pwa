import { useCallback, useEffect, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  buildLaporanPosisiUangPaturunanPdfInput,
  posisiUangPaturunanExportSlug,
} from "../../lib/laporan-posisi-uang-paturunan-pdf";
import { formatRupiah } from "../../lib/paturunan-hitung";
import {
  getLaporanPosisiUangPaturunan,
  type LaporanPosisiUangPaturunan,
  type PosisiUangBucket,
} from "../../lib/services/laporan-posisi-uang-paturunan";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { DateInput } from "../../components/ui/DateInput";
import { Label } from "../../components/ui/Input";
import { IconLink } from "../../components/ui/IconLink";
import {
  LAPORAN_BODY_ROW,
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { ArrowLeft, Coins, Filter, RotateCcw } from "lucide-react";

function StatChip({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "amber" | "emerald" | "warn";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300 bg-amber-50/80 text-amber-950"
      : tone === "emerald"
        ? "border-emerald-300 bg-emerald-50/80 text-emerald-950"
        : tone === "warn"
          ? "border-red-300 bg-red-50/80 text-red-900"
          : "border-copper-200 bg-copper-50/80 text-copper-900";
  return (
    <span
      className={cn(
        "inline-flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-xs",
        toneClass
      )}
    >
      <span className="text-muted font-medium">{label}</span>
      <span className="font-semibold tabular-nums text-sm">{value}</span>
      {hint ? <span className="text-[10px] text-muted leading-snug">{hint}</span> : null}
    </span>
  );
}

function bucketHint(b: PosisiUangBucket): string {
  return `Wajib ${formatRupiah(b.wajib)} · Punia ${formatRupiah(b.punia)} · ${b.transaksi} trx`;
}

const PAGE_ID = "laporan/posisi-uang-paturunan";

export function LaporanPosisiUangPaturunanPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Posisi Uang Paturunan");

  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");
  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");
  const [laporan, setLaporan] = useState<LaporanPosisiUangPaturunan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLaporan(
        await getLaporanPosisiUangPaturunan({
          dari: dari || undefined,
          sampai: sampai || undefined,
        })
      );
    } catch (e) {
      setError(String(e));
      setLaporan(null);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setDari("");
    setSampai("");
  }

  async function exportExcel() {
    if (!laporan) return;
    setExportBusy(true);
    try {
      const slug = posisiUangPaturunanExportSlug(dari, sampai);
      const { total, di_petugas, di_bendahara, selisih, petugas_rows } = laporan;
      await downloadExcel(`posisi-uang-paturunan-${slug}`, {
        name: "Posisi Uang",
        headers: ["Uraian", "Wajib", "Punia", "Jumlah", "Transaksi"],
        rows: [
          ["Total dibayar krama", total.wajib, total.punia, total.jumlah, total.transaksi],
          [
            "Di tangan petugas",
            di_petugas.wajib,
            di_petugas.punia,
            di_petugas.jumlah,
            di_petugas.transaksi,
          ],
          [
            "Sudah di bendahara",
            di_bendahara.wajib,
            di_bendahara.punia,
            di_bendahara.jumlah,
            di_bendahara.transaksi,
          ],
          ["Cek selisih", "", "", selisih, ""],
          [],
          ["Petugas", "Wajib", "Punia", "Total", "Trx / Tgl tertua"],
          ...petugas_rows.map((r) => [
            r.petugas_nama,
            r.wajib,
            r.punia,
            r.total,
            `${r.jumlah_transaksi} / ${r.tanggal_tertua}`,
          ]),
        ],
      });
    } finally {
      setExportBusy(false);
    }
  }

  function exportPdf() {
    if (!laporan) return;
    openPdfPreview(
      buildLaporanPosisiUangPaturunanPdfInput(laporan, { dari, sampai })
    );
  }

  const hasData = !!laporan && laporan.total.transaksi > 0;
  const selisihOk = laporan ? laporan.selisih === 0 : true;

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <Coins className="text-copper-700 shrink-0" size={22} />
            Posisi Uang Paturunan
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Rekonsiliasi penerimaan: total dibayar krama = di tangan petugas + sudah di bendahara
            (sudah disetor). Bukan saldo kas setelah pengeluaran.
          </p>
        </div>
        <IconLink to="/laporan" icon={ArrowLeft}>
          Kembali ke Laporan
        </IconLink>
      </div>

      <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, "mt-4")}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Label className="text-[11px]">Dari tanggal bayar</Label>
            <DateInput value={dari} onChange={setDari} />
          </div>
          <div className="w-36">
            <Label className="text-[11px]">Sampai</Label>
            <DateInput value={sampai} onChange={setSampai} />
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
              onPdf={() => exportPdf()}
              disabled={!laporan || loading}
              busy={exportBusy}
            />
          </span>
        </div>
      </Card>

      {laporan && !loading && (
        <div className={cn("flex flex-wrap gap-2 mt-3", isPhone && "gap-1.5")}>
          <StatChip
            label="Total dibayar krama"
            value={formatRupiah(laporan.total.jumlah)}
            hint={bucketHint(laporan.total)}
          />
          <StatChip
            label="Di tangan petugas"
            value={formatRupiah(laporan.di_petugas.jumlah)}
            hint={bucketHint(laporan.di_petugas)}
            tone="amber"
          />
          <StatChip
            label="Sudah di bendahara"
            value={formatRupiah(laporan.di_bendahara.jumlah)}
            hint={bucketHint(laporan.di_bendahara)}
            tone="emerald"
          />
          <StatChip
            label="Cek selisih"
            value={formatRupiah(laporan.selisih)}
            hint={selisihOk ? "Total = petugas + bendahara" : "Perlu diperiksa"}
            tone={selisihOk ? "default" : "warn"}
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2 mt-3">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-muted mt-4">Memuat laporan…</p>}

      {!loading && laporan && !hasData && (
        <p className="text-sm text-muted mt-4 text-center py-6">
          Belum ada pembayaran paturunan pada filter ini.
        </p>
      )}

      {!loading && laporan && hasData && (
        <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, "mt-4 overflow-x-auto")}>
          <h3 className="text-sm font-semibold text-copper-950 mb-2">
            Rincian di tangan petugas
          </h3>
          {laporan.petugas_rows.length === 0 ? (
            <p className="text-xs text-muted py-3 text-center">
              Semua pembayaran pada periode ini sudah disetor ke bendahara.
            </p>
          ) : (
            <table className={cn(LAPORAN_TABLE, LAPORAN_TABLE_ELEMENT)}>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th>Petugas</th>
                  <th className="text-right">Trx</th>
                  <th className="text-right">Wajib</th>
                  <th className="text-right">Punia</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Tgl tertua</th>
                </tr>
              </thead>
              <tbody>
                {laporan.petugas_rows.map((r) => (
                  <tr key={r.petugas_id ?? "null"} className={LAPORAN_BODY_ROW}>
                    <td>{r.petugas_nama}</td>
                    <td className="text-right tabular-nums">{r.jumlah_transaksi}</td>
                    <td className="text-right tabular-nums">{formatRupiah(r.wajib)}</td>
                    <td className="text-right tabular-nums">{formatRupiah(r.punia)}</td>
                    <td className="text-right tabular-nums font-medium">
                      {formatRupiah(r.total)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatTanggalLahir(r.tanggal_tertua)}
                    </td>
                  </tr>
                ))}
                <tr className={cn(LAPORAN_BODY_ROW, "font-semibold bg-amber-50/60")}>
                  <td>Jumlah di tangan petugas</td>
                  <td className="text-right tabular-nums">
                    {laporan.di_petugas.transaksi}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatRupiah(laporan.di_petugas.wajib)}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatRupiah(laporan.di_petugas.punia)}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatRupiah(laporan.di_petugas.jumlah)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
