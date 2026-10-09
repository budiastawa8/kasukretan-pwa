import type { LaporanPdfInput, LaporanPdfTableBlock } from "./laporan-pdf";
import { formatRupiah } from "./dudukan-hitung";
import {
  formatPencapaianPlafon,
  type LaporanPlafonDanaDudukan,
  type PengeluaranDanaDudukanPerPosRow,
} from "./services/laporan-plafon-dana-dudukan";
import {
  LAPORAN_DEFAULT_HEADER_FONT_SIZE,
  LAPORAN_DEFAULT_ROW_FONT_SIZE,
} from "./pdf-laporan-table";
import { formatTanggalLahir } from "./utils";

const BODY_FONT_EXTRA_PT = 2;
const ROW_FONT_SIZE = LAPORAN_DEFAULT_ROW_FONT_SIZE + BODY_FONT_EXTRA_PT;
const HEADER_FONT_SIZE = LAPORAN_DEFAULT_HEADER_FONT_SIZE + BODY_FONT_EXTRA_PT;
const META_FONT_SIZE = 8.5 + BODY_FONT_EXTRA_PT;
function fmtRp(n: number): string {
  return formatRupiah(Math.round(Number(n) || 0));
}

function keteranganTx(tx: PengeluaranDanaDudukanPerPosRow): string {
  const parts = [tx.transaksi_keterangan?.trim(), tx.pos_keterangan?.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function buildRincianTable(
  rows: LaporanPlafonDanaDudukan["rows"],
  transaksiByPos: Map<string, PengeluaranDanaDudukanPerPosRow[]>
): LaporanPdfTableBlock {
  const rincianRows: (string | number)[][] = [];
  const boldRows: number[] = [];
  const highlightRows: number[] = [];
  const groupBandRows: Record<number, string> = {};

  for (const pos of rows) {
    const bandIdx = rincianRows.length;
    groupBandRows[bandIdx] = pos.pos_biaya_nama;
    rincianRows.push(["", "", "", ""]);

    const txs = transaksiByPos.get(pos.pos_biaya_id) ?? [];
    if (txs.length === 0) {
      rincianRows.push(["—", "—", "Tidak ada transaksi", "—"]);
    } else {
      for (const tx of txs) {
        rincianRows.push([
          formatTanggalLahir(tx.tanggal),
          tx.akun_keuangan_nama,
          keteranganTx(tx),
          fmtRp(tx.jumlah),
        ]);
      }
      const subIdx = rincianRows.length;
      rincianRows.push(["", "", `Subtotal ${pos.pos_biaya_nama}`, fmtRp(pos.terpakai)]);
      boldRows.push(subIdx);
      highlightRows.push(subIdx);
    }
  }

  return {
    sectionTitle: "Rincian Pengeluaran",
    headers: ["Tanggal", "Akun / Sub Akun", "Uraian", "Jumlah"],
    rows: rincianRows,
    columnFractions: [0.12, 0.22, 0.46, 0.2],
    alignRight: [3],
    wrapColumns: [2],
    boldRows,
    highlightRows,
    groupBandRows,
    rowFontSize: ROW_FONT_SIZE,
    headerFontSize: HEADER_FONT_SIZE,
  };
}

export function buildLaporanPlafonDanaDudukanPdfInput(
  laporan: LaporanPlafonDanaDudukan,
  transaksiByPos: Map<string, PengeluaranDanaDudukanPerPosRow[]>
): LaporanPdfInput {
  const { tahun, total_penerimaan, rows } = laporan;
  const periode = `Tahun ${tahun}`;

  const headers = ["Pos biaya", "%", "Plafon", "Terpakai", "Sisa", "Pencapaian"];
  const pdfRows: (string | number)[][] = [];
  const boldRows: number[] = [];
  const highlightRows: number[] = [];

  for (const r of rows) {
    pdfRows.push([
      r.pos_biaya_nama,
      `${r.persen}%`,
      fmtRp(r.plafon),
      fmtRp(r.terpakai),
      fmtRp(r.sisa),
      formatPencapaianPlafon(r.pencapaian_pct),
    ]);
  }

  const totalRowIdx = pdfRows.length;
  pdfRows.push([
    "JUMLAH",
    "100%",
    fmtRp(total_penerimaan),
    fmtRp(laporan.total_terpakai),
    fmtRp(laporan.total_sisa),
    laporan.total_penerimaan > 0
      ? formatPencapaianPlafon(
          Math.round((laporan.total_terpakai / total_penerimaan) * 1000) / 10
        )
      : "—",
  ]);
  boldRows.push(totalRowIdx);
  highlightRows.push(totalRowIdx);

  return {
    filename: `laporan-plafon-dana-dudukan-${tahun}`,
    judul: "Laporan Plafon Dana Dudukan",
    subjudul: "Pencapaian alokasi pengeluaran tahunan",
    periode,
    metaLines: [
      `TAHUN: ${tahun}`,
      `PENERIMAAN DUDUKAN: ${fmtRp(total_penerimaan)}`,
    ],
    headers,
    rows: pdfRows,
    columnFractions: [0.18, 0.08, 0.16, 0.16, 0.14, 0.18],
    alignRight: [1, 2, 3, 4, 5],
    boldRows,
    highlightRows,
    rowFontSize: ROW_FONT_SIZE,
    headerFontSize: HEADER_FONT_SIZE,
    metaFontSize: META_FONT_SIZE,
    extraTables: [buildRincianTable(rows, transaksiByPos)],
    orientation: "landscape",
  };
}
