import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./paturunan-hitung";
import type { LaporanPuniaRingkasan } from "./services/laporan-punia";
import type { PaturunanKramaRow } from "./services/paturunan";
import { formatBanjarLaporanNama } from "./services/laporan-rekap-penerimaan-dudukan";
import { compareKramaWilayah } from "./wilayah-order";

const HEADERS = ["No", "No. Pipil", "Pengarep", "Jenis", "Banjar", "Jumlah Punia"] as const;

const EMPTY_ROW = ["", "", "", "", "", ""];

function fmtRp(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v > 0 ? formatRupiah(v) : "—";
}

function rowToCells(nomorUrut: number, r: PaturunanKramaRow): string[] {
  return [
    String(nomorUrut),
    r.nomor_kartu,
    r.kepala_nama,
    r.jenis_nama?.trim() || "—",
    r.banjar_nama?.trim() || "—",
    fmtRp(r.punia),
  ];
}

function formatBanjarBandLabel(banjarNama: string): string {
  return formatBanjarLaporanNama(banjarNama).toLocaleUpperCase("id-ID");
}

function formatTempekBandLabel(tempekNama: string | null | undefined): string {
  const name = tempekNama?.trim() || "—";
  return name === "—" ? "Tempek —" : `Tempek ${name}`;
}

function sumPunia(rows: PaturunanKramaRow[]): number {
  return rows.reduce((s, r) => s + (r.punia ?? 0), 0);
}

function subtotalCells(label: string, rows: PaturunanKramaRow[]): string[] {
  return ["", "", label, "", "", fmtRp(sumPunia(rows))];
}

function buildGroupedTableRows(rows: PaturunanKramaRow[]): {
  tableRows: string[][];
  groupBandRows: Record<number, string>;
  groupBandFontSize: Record<number, number>;
  boldRows: number[];
  highlightRows: number[];
  thickBorderBeforeRows: number[];
} {
  const sorted = [...rows].sort(compareKramaWilayah);
  const tableRows: string[][] = [];
  const groupBandRows: Record<number, string> = {};
  const groupBandFontSize: Record<number, number> = {};
  const boldRows: number[] = [];
  const highlightRows: number[] = [];
  const thickBorderBeforeRows: number[] = [];

  let i = 0;
  let nomor = 0;
  while (i < sorted.length) {
    const banjar = sorted[i]!.banjar_nama;
    const banjarStart = i;
    while (i < sorted.length && sorted[i]!.banjar_nama === banjar) i += 1;
    const banjarRows = sorted.slice(banjarStart, i);

    const bandIdx = tableRows.length;
    groupBandRows[bandIdx] = formatBanjarBandLabel(banjar);
    groupBandFontSize[bandIdx] = 9;
    tableRows.push([...EMPTY_ROW]);
    thickBorderBeforeRows.push(bandIdx);

    let j = 0;
    while (j < banjarRows.length) {
      const tempek = banjarRows[j]!.tempek_nama;
      const tempekStart = j;
      while (j < banjarRows.length && banjarRows[j]!.tempek_nama === tempek) j += 1;
      const tempekRows = banjarRows.slice(tempekStart, j);

      const tempekBandIdx = tableRows.length;
      groupBandRows[tempekBandIdx] = formatTempekBandLabel(tempek);
      groupBandFontSize[tempekBandIdx] = 8;
      tableRows.push([...EMPTY_ROW]);

      for (const r of tempekRows) {
        nomor += 1;
        tableRows.push(rowToCells(nomor, r));
      }

      const subIdx = tableRows.length;
      tableRows.push(subtotalCells(`Jumlah ${formatTempekBandLabel(tempek)}`, tempekRows));
      boldRows.push(subIdx);
      highlightRows.push(subIdx);
    }

    const banjarSubIdx = tableRows.length;
    tableRows.push(subtotalCells(`Jumlah ${formatBanjarBandLabel(banjar)}`, banjarRows));
    boldRows.push(banjarSubIdx);
    highlightRows.push(banjarSubIdx);
  }

  if (sorted.length > 0) {
    const totalIdx = tableRows.length;
    tableRows.push(subtotalCells("TOTAL PUNIA", sorted));
    boldRows.push(totalIdx);
    highlightRows.push(totalIdx);
  }

  return { tableRows, groupBandRows, groupBandFontSize, boldRows, highlightRows, thickBorderBeforeRows };
}

function columnWeight(headers: readonly string[], rows: string[][], colIdx: number): number {
  let maxLen = headers[colIdx]?.length ?? 0;
  for (const row of rows) {
    maxLen = Math.max(maxLen, String(row[colIdx] ?? "").length);
  }
  return Math.max(maxLen, 2);
}

function buildDataColumnFractions(headers: readonly string[], rows: string[][]): number[] {
  return headers.map((_, colIdx) => {
    if (colIdx === 0) return 0;
    return columnWeight(headers, rows, colIdx);
  });
}

export function buildLaporanPuniaPdfInput(opts: {
  rows: PaturunanKramaRow[];
  iuranNama: string;
  filenameSlug: string;
  ringkasan?: LaporanPuniaRingkasan | null;
}): LaporanPdfInput {
  const { rows, iuranNama, filenameSlug, ringkasan } = opts;
  const sorted = [...rows].sort(compareKramaWilayah);
  const dataCells = sorted.map((r, i) => rowToCells(i + 1, r));
  const rowFontSize = 7;
  const { tableRows, groupBandRows, groupBandFontSize, boldRows, highlightRows, thickBorderBeforeRows } =
    buildGroupedTableRows(rows);
  const summary = ringkasan
    ? [
        `Iuran: ${iuranNama}`,
        `Pemberi punia: ${ringkasan.total_krama} krama · Total: ${formatRupiah(ringkasan.total_punia)}`,
        `Nyada/0%: ${ringkasan.jumlah_tidak_wajib} · Jenis wajib: ${ringkasan.jumlah_wajib}`,
      ]
    : [`Iuran: ${iuranNama}`];
  const noDigits = rows.length > 0 ? String(rows.length).length : 1;

  return {
    filename: `laporan-punia-${filenameSlug}`,
    judul: "Laporan Punia",
    periode: iuranNama,
    headers: [...HEADERS],
    rows: tableRows,
    groupBandRows,
    groupBandFontSize,
    boldRows,
    highlightRows,
    thickBorderBeforeRows,
    summaryLines: summary,
    compactColumns: [0],
    compactColumnExtraPt: { 0: Math.max(4, (noDigits - 1) * 5) },
    columnFractions: buildDataColumnFractions(HEADERS, dataCells),
    columnWidthExtraPt: { 1: 12, 5: 10 },
    alignRight: [0, 5],
    alignCenter: [1],
    wrapColumns: [2],
    rowFontSize,
    headerFontSize: 7.5,
    tableBottomMarginMm: 5,
    rowLineLeading: 1.25,
    rowPadMm: 1.2,
    continuationHeaderMm: 5,
  };
}
