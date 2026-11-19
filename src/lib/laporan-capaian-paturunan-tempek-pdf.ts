import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./paturunan-hitung";
import {
  formatPctTerhadapTagihan,
  formatStatusLunasCicilBelum,
  type CapaianPaturunanTempekRingkasan,
  type CapaianPaturunanTempekRow,
} from "./services/laporan-capaian-paturunan-tempek";
import { formatBanjarLaporanNama } from "./services/laporan-rekap-penerimaan-dudukan";

export const LAPORAN_CAPAIAN_PATURUNAN_TEMPEK_HEADERS = [
  "No",
  "Banjar",
  "Tempek",
  "Lunas / Cicil / Belum",
  "Tagihan",
  "Dibayar",
  "% Dibayar",
  "Sisa",
  "% Sisa",
  "Jml Punia",
] as const;

function fmtRp(n: number): string {
  return n > 0 ? formatRupiah(n) : "—";
}

function rowToCells(no: number, r: CapaianPaturunanTempekRow): (string | number)[] {
  return [
    no,
    formatBanjarLaporanNama(r.banjar_nama),
    r.tempek_nama,
    formatStatusLunasCicilBelum(r.jumlah_lunas, r.jumlah_cicil, r.jumlah_belum),
    fmtRp(r.tagihan),
    fmtRp(r.dibayar),
    formatPctTerhadapTagihan(r.pct_dibayar),
    fmtRp(r.sisa),
    formatPctTerhadapTagihan(r.pct_sisa),
    fmtRp(r.punia),
  ];
}

export function buildLaporanCapaianPaturunanTempekPdfInput(opts: {
  rows: CapaianPaturunanTempekRow[];
  ringkasan: CapaianPaturunanTempekRingkasan | null;
  iuranNama: string;
  banjarFilterNama?: string;
  filenameSlug: string;
}): LaporanPdfInput {
  const { rows, ringkasan, iuranNama, banjarFilterNama, filenameSlug } = opts;
  const tableRows = rows.map((r, i) => rowToCells(i + 1, r));
  const boldRows: number[] = [];
  const highlightRows: number[] = [];
  const thickBorderBeforeRows: number[] = [];

  if (ringkasan && rows.length > 0) {
    const idx = tableRows.length;
    tableRows.push([
      "",
      "",
      "JUMLAH KESELURUHAN",
      formatStatusLunasCicilBelum(
        ringkasan.jumlah_lunas,
        ringkasan.jumlah_cicil,
        ringkasan.jumlah_belum
      ),
      fmtRp(ringkasan.total_tagihan),
      fmtRp(ringkasan.total_dibayar),
      formatPctTerhadapTagihan(ringkasan.pct_dibayar),
      fmtRp(ringkasan.total_sisa),
      formatPctTerhadapTagihan(ringkasan.pct_sisa),
      fmtRp(ringkasan.total_punia),
    ]);
    boldRows.push(idx);
    highlightRows.push(idx);
    thickBorderBeforeRows.push(idx);
  }

  const metaLines = [
    banjarFilterNama?.trim()
      ? `BANJAR ADAT: ${banjarFilterNama.trim()}`
      : "BANJAR ADAT: SEMUA BANJAR",
  ];

  return {
    filename: `capaian-paturunan-tempek-${filenameSlug}`,
    judul: "Capaian Paturunan per Tempek",
    subjudul: iuranNama,
    subjudulUppercase: true,
    periode: "",
    metaLines,
    headers: [...LAPORAN_CAPAIAN_PATURUNAN_TEMPEK_HEADERS],
    rows: tableRows,
    boldRows,
    highlightRows,
    thickBorderBeforeRows,
    orientation: "landscape",
    compactColumns: [0],
    fixedColumnWidthsPt: {
      0: 26,
      1: 95,
      2: 100,
      3: 88,
      6: 52,
      8: 48,
    },
    columnFractions: [0, 0, 0, 0, 1.1, 1.1, 0, 1.1, 0, 1],
    alignRight: [0, 3, 4, 5, 6, 7, 8, 9],
    wrapColumns: [1, 2],
    rowFontSize: 9,
    headerFontSize: 9,
    tableFont: "barlow-condensed",
    fillPageVertically: true,
    tableBottomMarginMm: 5,
    rowLineLeading: 1.2,
    rowPadMm: 1,
    continuationHeaderMm: 4.5,
  };
}
