import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./paturunan-hitung";
import {
  formatPctTerhadapTagihan,
  type CapaianPaturunanTempekRingkasan,
  type CapaianPaturunanTempekRow,
} from "./services/laporan-capaian-paturunan-tempek";
import { formatBanjarLaporanNama } from "./services/laporan-rekap-penerimaan-dudukan";

export const LAPORAN_CAPAIAN_PATURUNAN_TEMPEK_HEADERS = [
  "No",
  "Banjar",
  "Tempek",
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
      1: 100,
      2: 110,
      5: 55,
      7: 52,
    },
    columnFractions: [0, 0, 0, 1.15, 1.15, 0, 1.15, 0, 1.05],
    alignRight: [0, 3, 4, 5, 6, 7, 8],
    wrapColumns: [1, 2],
    rowFontSize: 9,
    headerFontSize: 9.5,
    tableFont: "barlow-condensed",
    fillPageVertically: true,
    tableBottomMarginMm: 5,
    rowLineLeading: 1.2,
    rowPadMm: 1,
    continuationHeaderMm: 4.5,
  };
}
