import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./dudukan-hitung";
import type {
  LaporanPenerimaanDanaLainRingkasan,
  LaporanPenerimaanDanaLainRow,
} from "./services/laporan-penerimaan-dana-lain";
import { formatTanggalLahir } from "./utils";

function fmtRp(n: number): string {
  return n > 0 ? formatRupiah(n) : "—";
}

export function buildLaporanPenerimaanDanaLainPdfInput(params: {
  rows: LaporanPenerimaanDanaLainRow[];
  ringkasan: LaporanPenerimaanDanaLainRingkasan;
  periode: string;
  filterLabel?: string;
}): LaporanPdfInput {
  const headers = [
    "No",
    "Tanggal",
    "Jenis",
    "Sumber",
    "Nama",
    "Kegiatan",
    "Jumlah",
    "Petugas",
    "Setor",
  ];
  const tableRows = params.rows.map((r, i) => [
    String(i + 1),
    formatTanggalLahir(r.tanggal),
    r.jenis_label,
    r.sumber_tipe_label,
    r.sumber_nama,
    r.kegiatan?.trim() || "—",
    fmtRp(r.jumlah),
    r.petugas_nama?.trim() || "—",
    r.tanggal_setor ? formatTanggalLahir(r.tanggal_setor) : "Belum",
  ]);

  tableRows.push([
    "",
    "",
    "",
    "",
    "JUMLAH",
    "",
    fmtRp(params.ringkasan.total),
    "",
    "",
  ]);

  return {
    filename: `laporan-punia-kerjasama-${Date.now()}.pdf`,
    judul: "Laporan Punia Kasukretan & Dana Kerjasama",
    subjudul: params.filterLabel,
    periode: params.periode,
    headers,
    rows: tableRows,
    boldRows: [tableRows.length - 1],
    orientation: "landscape",
    alignRight: [6],
    metaLines: [
      `Transaksi: ${params.ringkasan.jumlah_transaksi}`,
      `Punia: ${fmtRp(params.ringkasan.total_punia)} · Kerjasama: ${fmtRp(params.ringkasan.total_kerjasama)}`,
      `Belum setor: ${fmtRp(params.ringkasan.belum_setor)} · Sudah setor: ${fmtRp(params.ringkasan.sudah_setor)}`,
    ],
  };
}
