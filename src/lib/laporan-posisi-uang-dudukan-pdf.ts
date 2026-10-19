import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./dudukan-hitung";
import type { LaporanPosisiUangDudukan } from "./services/laporan-posisi-uang-dudukan";
import { formatTanggalLahir } from "./utils";

function fmtRp(n: number): string {
  return formatRupiah(Math.round(Number(n) || 0));
}

function formatPeriodeLabel(dari?: string, sampai?: string): string {
  const d = dari?.trim();
  const s = sampai?.trim();
  if (d && s) return `Periode bayar: ${formatTanggalLahir(d)} s.d. ${formatTanggalLahir(s)}`;
  if (d) return `Periode bayar: dari ${formatTanggalLahir(d)}`;
  if (s) return `Periode bayar: sampai ${formatTanggalLahir(s)}`;
  return "Periode bayar: semua tanggal";
}

export function posisiUangDudukanExportSlug(dari?: string, sampai?: string): string {
  const d = dari?.trim();
  const s = sampai?.trim();
  return d || s ? `${d || "awal"}_${s || "akhir"}` : "semua";
}

export function buildLaporanPosisiUangDudukanPdfInput(
  laporan: LaporanPosisiUangDudukan,
  opts: { dari?: string; sampai?: string }
): LaporanPdfInput {
  const { total, di_petugas, di_bendahara, selisih, petugas_rows } = laporan;

  const summaryLines = [
    `Total dibayar pemasih: ${fmtRp(total.jumlah)} (${total.transaksi} trx)`,
    `Di tangan petugas: ${fmtRp(di_petugas.jumlah)} (${di_petugas.transaksi} trx)`,
    `Sudah di bendahara: ${fmtRp(di_bendahara.jumlah)} (${di_bendahara.transaksi} trx)`,
    `Cek selisih: ${fmtRp(selisih)}`,
  ];

  const rows: (string | number)[][] = petugas_rows.map((r) => [
    r.petugas_nama,
    r.jumlah_transaksi,
    fmtRp(r.total),
    formatTanggalLahir(r.tanggal_tertua),
  ]);

  const boldRows: number[] = [];
  if (petugas_rows.length > 0) {
    boldRows.push(rows.length);
    rows.push([
      "JUMLAH DI TANGAN PETUGAS",
      di_petugas.transaksi,
      fmtRp(di_petugas.jumlah),
      "",
    ]);
  }

  return {
    filename: `posisi-uang-dudukan-${posisiUangDudukanExportSlug(opts.dari, opts.sampai)}`,
    judul: "Laporan Posisi Uang Dudukan",
    subjudul: "Total dibayar = Di petugas + Sudah di bendahara",
    periode: formatPeriodeLabel(opts.dari, opts.sampai),
    summaryLines,
    headers: ["Petugas", "Trx", "Total", "Tgl tertua"],
    rows: rows.length > 0 ? rows : [["—", "—", "—", "—"]],
    columnFractions: [0.4, 0.12, 0.28, 0.2],
    alignRight: [1, 2],
    boldRows,
    highlightRows: boldRows,
    thickBorderBeforeRows: boldRows,
  };
}
