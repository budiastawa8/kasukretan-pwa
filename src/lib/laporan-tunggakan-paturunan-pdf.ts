import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./paturunan-hitung";
import type { LaporanTunggakanPaturunanRingkasan } from "./services/laporan-tunggakan-paturunan";
import type { PaturunanKramaRow } from "./services/paturunan";
import { formatBanjarLaporanNama } from "./services/laporan-rekap-penerimaan-dudukan";
import { compareKramaWilayah } from "./wilayah-order";

const HEADERS = [
  "No",
  "No. Pipil",
  "Pengarep",
  "Jenis",
  "Tagihan",
  "Dibayar Wajib",
  "Sisa",
] as const;

const EMPTY_ROW = ["", "", "", "", "", "", ""];

function compareNomorKartu(a: string, b: string): number {
  return a.localeCompare(b, "id", { numeric: true });
}

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
    fmtRp(r.tagihan),
    fmtRp(r.dibayar),
    fmtRp(r.sisa),
  ];
}

function formatBanjarBandLabel(banjarNama: string): string {
  return formatBanjarLaporanNama(banjarNama).toLocaleUpperCase("id-ID");
}

function formatTempekBandLabel(tempekNama: string | null | undefined): string {
  const name = tempekNama?.trim() || "—";
  return name === "—" ? "Tempek —" : `Tempek ${name}`;
}

function formatArahanBandLabel(arahanNama: string | null | undefined): string {
  return `Arahan : ${arahanNama?.trim() || "—"}`;
}

function sumMoney(rows: PaturunanKramaRow[]) {
  return {
    tagihan: rows.reduce((s, r) => s + (r.tagihan ?? 0), 0),
    dibayar: rows.reduce((s, r) => s + (r.dibayar ?? 0), 0),
    sisa: rows.reduce((s, r) => s + (r.sisa ?? 0), 0),
  };
}

function subtotalCells(label: string, rows: PaturunanKramaRow[]): string[] {
  const sums = sumMoney(rows);
  return ["", "", label, "", fmtRp(sums.tagihan), fmtRp(sums.dibayar), fmtRp(sums.sisa)];
}

function buildGroupedTableRows(rows: PaturunanKramaRow[], rowFontSize: number): {
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
  let nomorUrut = 0;
  let lastBanjarKey = "";
  let lastTempekKey = "";
  let lastBanjarNama = "";
  let lastTempekNama: string | null | undefined = "";
  let banjarRows: PaturunanKramaRow[] = [];
  let tempekRows: PaturunanKramaRow[] = [];

  const pushSubtotal = (cells: string[], opts?: { separatorBefore?: boolean }) => {
    const idx = tableRows.length;
    tableRows.push(cells);
    boldRows.push(idx);
    highlightRows.push(idx);
    if (opts?.separatorBefore) thickBorderBeforeRows.push(idx);
  };

  const flushTempekSubtotal = () => {
    if (tempekRows.length === 0) return;
    const name = lastTempekNama?.trim() || "—";
    pushSubtotal(subtotalCells(`Jumlah Tempek : ${name}`, tempekRows));
    tempekRows = [];
  };

  const flushBanjarSubtotal = () => {
    if (banjarRows.length === 0) return;
    pushSubtotal(
      subtotalCells(`Jumlah Banjar : ${formatBanjarLaporanNama(lastBanjarNama)}`, banjarRows)
    );
    banjarRows = [];
  };

  type WilayahSection = {
    banjarNama: string;
    tempekNama: string | null | undefined;
    arahanNama: string | null | undefined;
    rows: PaturunanKramaRow[];
  };
  const sections: WilayahSection[] = [];

  for (const r of sorted) {
    const banjarKey = r.banjar_nama.trim() || "—";
    const tempekKey = r.tempek_nama?.trim() || "—";
    const arahanKey = r.arahan_nama?.trim() || "—";
    const last = sections[sections.length - 1];
    if (
      !last ||
      (last.banjarNama.trim() || "—") !== banjarKey ||
      (last.tempekNama?.trim() || "—") !== tempekKey ||
      (last.arahanNama?.trim() || "—") !== arahanKey
    ) {
      sections.push({
        banjarNama: r.banjar_nama,
        tempekNama: r.tempek_nama,
        arahanNama: r.arahan_nama,
        rows: [r],
      });
    } else {
      last.rows.push(r);
    }
  }

  for (const section of sections) {
    const banjarKey = section.banjarNama.trim() || "—";
    const tempekKey = section.tempekNama?.trim() || "—";

    if (banjarKey !== lastBanjarKey) {
      if (lastBanjarKey) {
        flushTempekSubtotal();
        flushBanjarSubtotal();
      }
      const idx = tableRows.length;
      groupBandRows[idx] = formatBanjarBandLabel(section.banjarNama);
      groupBandFontSize[idx] = rowFontSize + 2;
      tableRows.push([...EMPTY_ROW]);
      lastBanjarKey = banjarKey;
      lastBanjarNama = section.banjarNama;
      lastTempekKey = "";
    } else if (tempekKey !== lastTempekKey) {
      flushTempekSubtotal();
      lastTempekNama = section.tempekNama;
    }

    if (tempekKey !== lastTempekKey) {
      const idx = tableRows.length;
      groupBandRows[idx] = formatTempekBandLabel(section.tempekNama);
      groupBandFontSize[idx] = rowFontSize + 1.5;
      tableRows.push([...EMPTY_ROW]);
      lastTempekKey = tempekKey;
      lastTempekNama = section.tempekNama;
    }

    {
      const idx = tableRows.length;
      groupBandRows[idx] = formatArahanBandLabel(section.arahanNama);
      groupBandFontSize[idx] = rowFontSize + 1;
      tableRows.push([...EMPTY_ROW]);
    }

    const sortedSectionRows = [...section.rows].sort((a, b) =>
      compareNomorKartu(a.nomor_kartu, b.nomor_kartu)
    );
    for (const r of sortedSectionRows) {
      nomorUrut += 1;
      tableRows.push(rowToCells(nomorUrut, r));
    }

    const arahanName = section.arahanNama?.trim() || "—";
    pushSubtotal(subtotalCells(`Jumlah Arahan : ${arahanName}`, section.rows));

    tempekRows.push(...section.rows);
    banjarRows.push(...section.rows);
  }

  flushTempekSubtotal();
  flushBanjarSubtotal();

  pushSubtotal(subtotalCells("JUMLAH KESELURUHAN", sorted), { separatorBefore: true });

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

export function buildLaporanTunggakanPaturunanPdfInput(opts: {
  rows: PaturunanKramaRow[];
  iuranNama: string;
  filenameSlug: string;
  ringkasan?: LaporanTunggakanPaturunanRingkasan | null;
}): LaporanPdfInput {
  const { rows, iuranNama, filenameSlug, ringkasan } = opts;
  const sorted = [...rows].sort(compareKramaWilayah);
  const dataCells = sorted.map((r, i) => rowToCells(i + 1, r));
  const rowFontSize = 7;
  const { tableRows, groupBandRows, groupBandFontSize, boldRows, highlightRows, thickBorderBeforeRows } =
    buildGroupedTableRows(rows, rowFontSize);
  const summary = ringkasan
    ? [
        `Iuran: ${iuranNama}`,
        `Tunggakan: ${ringkasan.total_krama_tunggakan} krama · Total sisa: ${formatRupiah(ringkasan.total_sisa)}`,
      ]
    : [`Iuran: ${iuranNama}`];
  const noDigits = rows.length > 0 ? String(rows.length).length : 1;

  return {
    filename: `tunggakan-paturunan-${filenameSlug}`,
    judul: "Laporan Tunggakan Paturunan",
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
    columnWidthExtraPt: { 1: 12, 4: 8, 5: 8, 6: 8 },
    alignRight: [0, 4, 5, 6],
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
