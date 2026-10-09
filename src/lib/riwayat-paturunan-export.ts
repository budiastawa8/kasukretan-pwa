import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./paturunan-hitung";
import type { PaturunanRiwayatRow } from "./services/paturunan-pembayaran";
import type { PaturunanPembayaranJenis } from "./types";
import {
  compareBanjarKode,
  compareWilayahCreatedAt,
} from "./wilayah-order";
import { formatTanggalLahir } from "./utils";

export const RIWAYAT_PATURUNAN_EXPORT_HEADERS = [
  "Tgl",
  "No Pipil",
  "Pengarep",
  "Jenis Bayar",
  "Jumlah",
  "Petugas",
] as const;

export type RiwayatPaturunanExportFilter = {
  iuranNama?: string;
  banjarNama?: string;
  tempekNama?: string;
  petugasNama?: string;
  jenisBayar?: string;
  q?: string;
};

function jenisBayarLabel(jenis: PaturunanPembayaranJenis): string {
  return jenis === "punia" ? "Punia" : "Wajib";
}

function compareIuranRow(a: PaturunanRiwayatRow, b: PaturunanRiwayatRow): number {
  const byCreated = compareWilayahCreatedAt(a.iuran_created_at, b.iuran_created_at);
  if (byCreated !== 0) return byCreated;
  return (a.iuran_nama ?? "").localeCompare(b.iuran_nama ?? "", "id");
}

export function compareRiwayatPaturunanExport(a: PaturunanRiwayatRow, b: PaturunanRiwayatRow): number {
  const byIuran = compareIuranRow(a, b);
  if (byIuran !== 0) return byIuran;
  const byBanjar = compareBanjarKode(a.banjar_kode ?? "", b.banjar_kode ?? "");
  if (byBanjar !== 0) return byBanjar;
  const byTempek = compareWilayahCreatedAt(a.tempek_created_at, b.tempek_created_at);
  if (byTempek !== 0) return byTempek;
  const byTanggal = (a.tanggal ?? "").localeCompare(b.tanggal ?? "");
  if (byTanggal !== 0) return byTanggal;
  const byTempekNama = (a.tempek_nama ?? "").localeCompare(b.tempek_nama ?? "", "id");
  if (byTempekNama !== 0) return byTempekNama;
  return (a.nomor_kartu ?? "").localeCompare(b.nomor_kartu ?? "", "id", { numeric: true });
}

/** Urut: Jenis Paturunan → Banjar → Tempek → Tanggal → No Pipil. */

export function sortRiwayatPaturunanExport(rows: PaturunanRiwayatRow[]): PaturunanRiwayatRow[] {
  return [...rows].sort(compareRiwayatPaturunanExport);
}

export function buildRiwayatPaturunanSubjudul(filter?: RiwayatPaturunanExportFilter): string {
  const parts: string[] = [];
  if (filter?.iuranNama?.trim()) parts.push(`Paturunan: ${filter.iuranNama.trim()}`);
  if (filter?.banjarNama?.trim()) parts.push(`Banjar: ${filter.banjarNama.trim()}`);
  if (filter?.tempekNama?.trim()) parts.push(`Tempek: ${filter.tempekNama.trim()}`);
  if (filter?.petugasNama?.trim()) parts.push(`Petugas: ${filter.petugasNama.trim()}`);
  if (filter?.jenisBayar?.trim()) parts.push(`Jenis Bayar: ${filter.jenisBayar.trim()}`);
  if (filter?.q?.trim()) parts.push(`Cari: ${filter.q.trim()}`);
  return parts.length > 0 ? parts.join(", ") : "Semua pembayaran paturunan";
}

function dataCells(r: PaturunanRiwayatRow, pdf: boolean): (string | number)[] {
  return [
    formatTanggalLahir(r.tanggal),
    r.nomor_kartu,
    r.kepala_nama,
    jenisBayarLabel(r.jenis),
    pdf ? formatRupiah(r.jumlah) : r.jumlah,
    r.petugas_nama ?? (pdf ? "—" : ""),
  ];
}

function buildFlatTable(rows: PaturunanRiwayatRow[], pdf: boolean): {
  rows: (string | number)[][];
  boldRows: number[];
  highlightRows: number[];
  thickBorderBeforeRows: number[];
} {
  const sorted = sortRiwayatPaturunanExport(rows);
  const tableRows = sorted.map((r) => dataCells(r, pdf));
  const grandTotal = sorted.reduce((s, r) => s + r.jumlah, 0);
  const footerIdx = tableRows.length;
  tableRows.push(["", "", "JUMLAH KESELURUHAN", "", pdf ? formatRupiah(grandTotal) : grandTotal, ""]);
  return {
    rows: tableRows,
    boldRows: [footerIdx],
    highlightRows: [footerIdx],
    thickBorderBeforeRows: [footerIdx],
  };
}

export function buildRiwayatPaturunanExportRows(
  rows: PaturunanRiwayatRow[]
): (string | number)[][] {
  return buildFlatTable(rows, false).rows;
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
  const parts = ["riwayat-paturunan"];
  if (dari?.trim()) parts.push(`dari-${dari.trim()}`);
  if (sampai?.trim()) parts.push(`sampai-${sampai.trim()}`);
  return parts.join("-");
}

export function riwayatPaturunanExportFilename(dari?: string, sampai?: string): string {
  return exportSlug(dari, sampai);
}

export function buildRiwayatPaturunanPdfInput(
  rows: PaturunanRiwayatRow[],
  opts: {
    dari?: string;
    sampai?: string;
    filter?: RiwayatPaturunanExportFilter;
  }
): LaporanPdfInput {
  const sorted = sortRiwayatPaturunanExport(rows);
  const totalWajib = sorted.filter((r) => r.jenis === "wajib").reduce((s, r) => s + r.jumlah, 0);
  const totalPunia = sorted.filter((r) => r.jenis === "punia").reduce((s, r) => s + r.jumlah, 0);
  const grandTotal = totalWajib + totalPunia;
  const rowFontSize = 10;
  const table = buildFlatTable(sorted, true);

  return {
    filename: exportSlug(opts.dari, opts.sampai),
    judul: "Riwayat Pembayaran Paturunan",
    subjudul: buildRiwayatPaturunanSubjudul(opts.filter),
    periode: formatPeriodeLabel(opts.dari, opts.sampai),
    summaryLines: [
      `Transaksi: ${sorted.length}`,
      `Total wajib: ${formatRupiah(totalWajib)}`,
      `Total punia: ${formatRupiah(totalPunia)}`,
      `Total keseluruhan: ${formatRupiah(grandTotal)}`,
    ],
    headers: [...RIWAYAT_PATURUNAN_EXPORT_HEADERS],
    rows: table.rows,
    columnFractions: [0.12, 0.14, 0.28, 0.12, 0.14, 0.2],
    alignRight: [4],
    boldRows: table.boldRows,
    highlightRows: table.highlightRows,
    thickBorderBeforeRows: table.thickBorderBeforeRows,
    orientation: "landscape",
    rowFontSize,
    headerFontSize: 10,
    wrapColumns: [2, 5],
    tableBottomMarginMm: 5,
  };
}
