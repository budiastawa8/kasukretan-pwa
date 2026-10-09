import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./paturunan-hitung";
import {
  buildLaporanPenerimaanPaturunanTableRows,
  type LaporanPenerimaanPaturunan,
} from "./services/laporan-penerimaan-paturunan";
import { formatTanggalLahir } from "./utils";

function fmtRp(n: number): string {
  return n > 0 ? formatRupiah(n) : "—";
}

function formatPeriodeLabel(dari?: string, sampai?: string): string {
  const d = dari?.trim();
  const s = sampai?.trim();
  if (d && s) return `Periode: ${formatTanggalLahir(d)} s.d. ${formatTanggalLahir(s)}`;
  if (d) return `Periode: dari ${formatTanggalLahir(d)}`;
  if (s) return `Periode: sampai ${formatTanggalLahir(s)}`;
  return "Periode: semua tanggal";
}

function exportSlug(dari?: string, sampai?: string): string {
  return dari?.trim() || sampai?.trim()
    ? `${dari?.trim() || "awal"}_${sampai?.trim() || "akhir"}`
    : "semua";
}

export function buildLaporanPenerimaanPaturunanPdfInput(
  laporan: LaporanPenerimaanPaturunan,
  opts: {
    dari?: string;
    sampai?: string;
    banjarNama?: string;
    tempekNama?: string;
    arahanNama?: string;
  }
): LaporanPdfInput {
  const tableRows = buildLaporanPenerimaanPaturunanTableRows(laporan);
  const rowFontSize = 12;
  const boldRows: number[] = [];
  const rowCellMerges: Record<number, Partial<Record<number, number>>> = {};
  const rows: (string | number)[][] = [];
  let pdfIdx = 0;

  for (const row of tableRows) {
    if (row.kind === "data") {
      rows.push([formatTanggalLahir(row.tanggal), row.uraian, fmtRp(row.jumlah)]);
      pdfIdx++;
      continue;
    }

    boldRows.push(pdfIdx);
    rowCellMerges[pdfIdx] = { 0: 2 };
    rows.push(["JUMLAH KESELURUHAN", "", fmtRp(row.total)]);
    pdfIdx++;
  }

  const footerIdx = rows.length - 1;
  const summaryLines = [`Total penerimaan: ${formatRupiah(laporan.grandTotal)}`];
  if (laporan.rowCount > 0) {
    summaryLines.push(`Jumlah baris: ${laporan.rowCount}`);
  }
  if (opts.banjarNama?.trim()) {
    summaryLines.push(`Banjar: ${opts.banjarNama.trim()}`);
  }
  if (opts.tempekNama?.trim()) {
    summaryLines.push(`Tempek: ${opts.tempekNama.trim()}`);
  }
  if (opts.arahanNama?.trim()) {
    summaryLines.push(`Arahan: ${opts.arahanNama.trim()}`);
  }

  return {
    filename: `laporan-penerimaan-paturunan-${exportSlug(opts.dari, opts.sampai)}`,
    judul: "Rekap Penerimaan Paturunan",
    subjudul: "Per Tanggal · Tempek · Petugas",
    periode: formatPeriodeLabel(opts.dari, opts.sampai),
    summaryLines,
    headers: ["Tanggal", "Uraian", "Jumlah"],
    rows,
    columnFractions: [0.18, 0.57, 0.25],
    alignRight: [2],
    rowCellMerges,
    boldRows,
    thickBorderBeforeRows: [footerIdx],
    orientation: "portrait",
    rowFontSize,
    headerFontSize: 12,
    wrapColumns: [1],
    tableBottomMarginMm: 5,
    rowLineLeading: 1.2,
    rowPadMm: 1,
    continuationHeaderMm: 4.5,
    summaryFontSize: 9,
  };
}
