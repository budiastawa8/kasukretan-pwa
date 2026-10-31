import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Filter, Gift, RotateCcw } from "lucide-react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  buildLaporanPosisiUangDanaLainPdfInput,
  posisiUangDanaLainExportSlug,
} from "../../lib/laporan-posisi-uang-dana-lain-pdf";
import { formatRupiah } from "../../lib/dudukan-hitung";
import {
  getLaporanPosisiUangDanaLain,
  type LaporanPosisiUangDanaLain,
  type PosisiUangDanaLainBucket,
} from "../../lib/services/laporan-posisi-uang-dana-lain";
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

function bucketHint(b: PosisiUangDanaLainBucket): string {
  return `${b.transaksi} transaksi`;
}

const PAGE_ID = "laporan/posisi-uang-dana-lain";

export function LaporanPosisiUangDanaLainPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Posisi Uang Punia & Kerjasama");

  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");
  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");
  const [laporan, setLaporan] = useState<LaporanPosisiUangDanaLain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLaporan(
        await getLaporanPosisiUangDanaLain({
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
      const slug = posisiUangDanaLainExportSlug(dari, sampai);
      const { total, di_petugas, di_bendahara, punia, kerjasama, selisih, petugas_rows } = laporan;
      await downloadExcel(`posisi-uang-punia-kerjasama-${slug}`, {
        name: "Posisi Uang",
        headers: ["Uraian", "Jumlah", "Transaksi"],
        rows: [
          ["Total diterima", total.jumlah, total.transaksi],
          ["Punia Kasukretan", punia.jumlah, punia.transaksi],
          ["Dana Kerjasama", kerjasama.jumlah, kerjasama.transaksi],
          ["Di tangan petugas", di_petugas.jumlah, di_petugas.transaksi],
          ["Sudah di bendahara", di_bendahara.jumlah, di_bendahara.transaksi],
          ["Cek selisih", selisih, ""],
          [],
          ["Petugas", "Total", "Trx / Tgl tertua"],
          ...petugas_rows.map((r) => [
            r.petugas_nama,
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
    openPdfPreview(buildLaporanPosisiUangDanaLainPdfInput(laporan, { dari, sampai }));
  }

  const hasData = !!laporan && laporan.total.transaksi > 0;
  const selisihOk = laporan ? laporan.selisih === 0 : true;

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <Gift className="text-copper-700 shrink-0" size={22} />
            Posisi Uang Punia &amp; Dana Kerjasama
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Rekonsiliasi: total diterima = di tangan petugas + sudah di bendahara (sudah disetor).
            Bukan saldo kas setelah pengeluaran.
          </p>
        </div>
        <IconLink to="/laporan" icon={ArrowLeft}>
          Kembali ke Laporan
        </IconLink>
      </div>

      <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, "mt-4")}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Label className="text-[11px]">Dari tanggal terima</Label>
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
            disabled={loading}
          >
            Terapkan
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn("text-xs", isPhone ? "h-11" : "h-9")}
            icon={RotateCcw}
            onClick={resetFilters}
          >
            Reset
          </Button>
          <LaporanExportButtons
            onExcel={() => void exportExcel()}
            onPdf={exportPdf}
            disabled={!hasData || loading}
            busy={exportBusy}
          />
        </div>
      </Card>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {loading && <p className="mt-3 text-sm text-muted">Memuat…</p>}

      {!loading && laporan && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatChip
              label="Total diterima"
              value={formatRupiah(laporan.total.jumlah)}
              hint={bucketHint(laporan.total)}
            />
            <StatChip
              label="Punia Kasukretan"
              value={formatRupiah(laporan.punia.jumlah)}
              hint={bucketHint(laporan.punia)}
            />
            <StatChip
              label="Dana Kerjasama"
              value={formatRupiah(laporan.kerjasama.jumlah)}
              hint={bucketHint(laporan.kerjasama)}
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
              hint={selisihOk ? "Seimbang" : "Perlu dicek"}
              tone={selisihOk ? "emerald" : "warn"}
            />
          </div>

          <Card
            title="Uang di tangan per petugas"
            className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, "mt-4")}
          >
            {!hasData ? (
              <p className="text-sm text-muted">Belum ada penerimaan pada filter ini.</p>
            ) : laporan.petugas_rows.length === 0 ? (
              <p className="text-sm text-muted">Tidak ada uang yang masih di tangan petugas.</p>
            ) : isPhone ? (
              <ul className="divide-y divide-copper-100">
                {laporan.petugas_rows.map((r) => (
                  <li key={r.petugas_id ?? "tanpa"} className="py-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{r.petugas_nama}</span>
                      <span className="tabular-nums font-semibold">{formatRupiah(r.total)}</span>
                    </div>
                    <p className="text-[11px] text-muted">
                      {r.jumlah_transaksi} trx · sejak {formatTanggalLahir(r.tanggal_tertua)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={LAPORAN_TABLE}>
                <table className={LAPORAN_TABLE_ELEMENT}>
                  <thead>
                    <tr className={LAPORAN_HEAD_ROW}>
                      <th>Petugas</th>
                      <th className="text-right">Trx</th>
                      <th className="text-right">Total</th>
                      <th>Tgl tertua</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laporan.petugas_rows.map((r) => (
                      <tr key={r.petugas_id ?? "tanpa"} className={LAPORAN_BODY_ROW}>
                        <td className="font-medium">{r.petugas_nama}</td>
                        <td className="text-right tabular-nums">{r.jumlah_transaksi}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatRupiah(r.total)}
                        </td>
                        <td className="whitespace-nowrap">
                          {formatTanggalLahir(r.tanggal_tertua)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
