import type { LaporanPdfInput } from "./laporan-pdf";
import { formatPeriodeDudukanMmYyyy, formatRupiah } from "./dudukan-hitung";
import type { DudukanRiwayatRow } from "./services/dudukan-pembayaran";
import { formatBanjarLaporanNama } from "./services/laporan-rekap-penerimaan-dudukan";
import { formatTanggalLahir } from "./utils";

export const RIWAYAT_DUDUKAN_EXPORT_HEADERS = [
  "Tgl. Bayar",
  "No. Kartu",
  "Pengajeg",
  "Alamat",
  "Jenis",
  "Periode",
  "Jumlah",
  "Petugas",
] as const;

export type RiwayatDudukanExportFilter = {
  banjarNama?: string;
  rtBtn?: string;
  petugasNama?: string;
  klasifikasi?: string;
  tahunTagihan?: string;
  bulanTagihan?: string;
  q?: string;
};

export function compareRiwayatDudukanExport(a: DudukanRiwayatRow, b: DudukanRiwayatRow): number {
  const byTanggal = (a.tanggal ?? "").localeCompare(b.tanggal ?? "");
  if (byTanggal !== 0) return byTanggal;
  return (a.nomor_kartu ?? "").localeCompare(b.nomor_kartu ?? "", "id", { numeric: true });
}

export function sortRiwayatDudukanExport(rows: DudukanRiwayatRow[]): DudukanRiwayatRow[] {
  return [...rows].sort(compareRiwayatDudukanExport);
}

export function buildRiwayatDudukanSubjudul(filter?: RiwayatDudukanExportFilter): string {
  const parts: string[] = [];
  if (filter?.banjarNama?.trim()) parts.push(formatBanjarLaporanNama(filter.banjarNama));
  if (filter?.rtBtn?.trim()) parts.push(filter.rtBtn.trim());
  if (filter?.petugasNama?.trim()) parts.push(filter.petugasNama.trim());
  if (filter?.klasifikasi?.trim()) parts.push(filter.klasifikasi.trim());
  if (filter?.tahunTagihan?.trim()) parts.push(`Tahun tagihan ${filter.tahunTagihan.trim()}`);
  if (filter?.bulanTagihan?.trim()) parts.push(filter.bulanTagihan.trim());
  if (filter?.q?.trim()) parts.push(`Cari: ${filter.q.trim()}`);
  return parts.length > 0 ? parts.join(", ") : "Semua pembayaran dudukan";
}

function dataCells(r: DudukanRiwayatRow, pdf: boolean): (string | number)[] {
  return [
    formatTanggalLahir(r.tanggal),
    r.nomor_kartu,
    r.kepala_nama,
    r.alamat,
    r.jenis_nama,
    formatPeriodeDudukanMmYyyy(r.bulan, r.tahun),
    pdf ? formatRupiah(r.jumlah) : r.jumlah,
    r.petugas_nama ?? (pdf ? "—" : ""),
  ];
}

function buildFlatTable(rows: DudukanRiwayatRow[], pdf: boolean): {
  rows: (string | number)[][];
  boldRows: number[];
  highlightRows: number[];
  thickBorderBeforeRows: number[];
} {
  const sorted = sortRiwayatDudukanExport(rows);
  const tableRows = sorted.map((r) => dataCells(r, pdf));
  const grandTotal = sorted.reduce((s, r) => s + r.jumlah, 0);
  const footerIdx = tableRows.length;
  tableRows.push([
    "",
    "",
    "JUMLAH KESELURUHAN",
    "",
    "",
    "",
    pdf ? formatRupiah(grandTotal) : grandTotal,
    "",
  ]);
  return {
    rows: tableRows,
    boldRows: [footerIdx],
    highlightRows: [footerIdx],
    thickBorderBeforeRows: [footerIdx],
  };
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
  const parts = ["riwayat-dudukan"];
  if (dari?.trim()) parts.push(`dari-${dari.trim()}`);
  if (sampai?.trim()) parts.push(`sampai-${sampai.trim()}`);
  return parts.join("-");
}

export function riwayatDudukanExportFilename(dari?: string, sampai?: string): string {
  return exportSlug(dari, sampai);
}

export function buildRiwayatDudukanPdfInput(
  rows: DudukanRiwayatRow[],
  opts: {
    dari?: string;
    sampai?: string;
    filter?: RiwayatDudukanExportFilter;
  }
): LaporanPdfInput {
  const sorted = sortRiwayatDudukanExport(rows);
  const grandTotal = sorted.reduce((s, r) => s + r.jumlah, 0);
  const rowFontSize = 10;
  const table = buildFlatTable(sorted, true);

  return {
    filename: exportSlug(opts.dari, opts.sampai),
    judul: "Riwayat Pembayaran Dudukan",
    subjudul: buildRiwayatDudukanSubjudul(opts.filter),
    periode: formatPeriodeLabel(opts.dari, opts.sampai),
    summaryLines: [
      `Transaksi: ${sorted.length}`,
      `Total kas: ${formatRupiah(grandTotal)}`,
    ],
    headers: [...RIWAYAT_DUDUKAN_EXPORT_HEADERS],
    rows: table.rows,
    columnFractions: [0.075, 0.11, 0.183, 0.214, 0.12, 0.06, 0.094, 0.12],
    alignRight: [6],
    boldRows: table.boldRows,
    highlightRows: table.highlightRows,
    thickBorderBeforeRows: table.thickBorderBeforeRows,
    orientation: "landscape",
    rowFontSize,
    headerFontSize: 10,
    wrapColumns: [2, 3, 4, 7],
    tableBottomMarginMm: 5,
  };
}
