import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./paturunan-hitung";
import type { RekapPenerimaanPaturunanPerBulan } from "./services/laporan-rekap-penerimaan-paturunan";
import {
  formatPeriodeRekapLabel,
} from "./laporan-rekap-penerimaan-paturunan-pdf";

function fmtRp(n: number): string {
  return n > 0 ? formatRupiah(n) : "—";
}

function buildColumnFractions(monthCount: number): number[] {
  const banjarFrac = 0.06;
  const tempekFrac = 0.112;
  const rest = 1 - banjarFrac - tempekFrac;
  const monthFrac = monthCount > 0 ? (rest * 0.85) / monthCount : rest * 0.85;
  const totalFrac = rest * 0.15;
  return [banjarFrac, tempekFrac, ...Array.from({ length: monthCount }, () => monthFrac), totalFrac];
}

export function buildRekapPenerimaanPaturunanBulanPdfInput(
  rekap: RekapPenerimaanPaturunanPerBulan,
  opts: { dari?: string; sampai?: string; iuranNama?: string }
): LaporanPdfInput {
  const rows: (string | number)[][] = rekap.rows.map((r) => [
    r.banjar_nama,
    r.tempek_nama,
    ...rekap.bulan.map((bk) => fmtRp(r.perBulan[bk] ?? 0)),
    fmtRp(r.total),
  ]);

  const footerIdx = rows.length;
  rows.push([
    "",
    "JUMLAH",
    ...rekap.bulan.map((bk) => fmtRp(rekap.totalPerBulan[bk] ?? 0)),
    fmtRp(rekap.grandTotal),
  ]);

  const slug =
    opts.dari?.trim() || opts.sampai?.trim()
      ? `${opts.dari?.trim() || "awal"}_${opts.sampai?.trim() || "akhir"}`
      : "semua";

  const summary = [`Total penerimaan: ${formatRupiah(rekap.grandTotal)}`];
  if (opts.iuranNama?.trim()) summary.unshift(`Iuran: ${opts.iuranNama.trim()}`);

  const monthCount = rekap.bulan.length;
  const alignRight = [
    ...Array.from({ length: monthCount }, (_, i) => i + 2),
    monthCount + 2,
  ];

  return {
    filename: `rekap-penerimaan-paturunan-bulan-${slug}`,
    judul: "Rekap Penerimaan Paturunan",
    subjudul: "Per Tempek · Bulan Bayar",
    periode: formatPeriodeRekapLabel(opts.dari, opts.sampai),
    summaryLines: summary,
    headers: ["Banjar", "Tempek", ...rekap.bulanLabel, "Total"],
    rows,
    columnFractions: buildColumnFractions(monthCount),
    alignRight,
    boldRows: [footerIdx],
    highlightRows: [footerIdx],
    thickBorderBeforeRows: [footerIdx],
    orientation: "landscape",
    rowFontSize: monthCount > 8 ? 7.5 : 8.5,
    headerFontSize: monthCount > 8 ? 8 : 9,
    tableBottomMarginMm: 5,
    rowLineLeading: 1.15,
    rowPadMm: 0.75,
    continuationHeaderMm: 4.5,
    summaryFontSize: 9,
  };
}
