import type { LaporanPdfInput } from "./laporan-pdf";
import { compareKramaWilayah } from "./wilayah-order";
import {
  formatStatusPipilRow,
  type LaporanMipilRingkasan,
} from "./services/laporan-mipil";
import { formatBanjarLaporanNama } from "./services/laporan-rekap-penerimaan-dudukan";
import type { KramaListItem } from "./types";
import { formatTanggalLahir } from "./utils";

const HEADERS = [
  "No",
  "No. Pipil",
  "Pengarep",
  "Jenis",
  "Status Pipil",
  "Tgl. Terdaftar",
] as const;

const EMPTY_ROW = ["", "", "", "", "", ""];

const JENIS_MIPIL_ORDER = [
  "ngarep jangkep",
  "ngarep balu",
  "ngarep nyapihan",
  "nyada",
] as const;

function compareNomorKartu(a: string, b: string): number {
  return a.localeCompare(b, "id", { numeric: true });
}

function normalizeJenisOrderName(nama: string): string {
  return nama.trim().replace(/^krama\s+/i, "").toLowerCase();
}

function jenisMipilRank(nama: string): number {
  const n = normalizeJenisOrderName(nama);
  const idx = JENIS_MIPIL_ORDER.indexOf(n as (typeof JENIS_MIPIL_ORDER)[number]);
  return idx >= 0 ? idx : JENIS_MIPIL_ORDER.length;
}

function groupByKey<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function groupRowsByJenis(rows: KramaListItem[]): KramaListItem[][] {
  return [...groupByKey(rows, (r) => r.jenis_nama?.trim() || "—").entries()]
    .sort((a, b) => {
      const byRank = jenisMipilRank(a[0]) - jenisMipilRank(b[0]);
      if (byRank !== 0) return byRank;
      return a[0].localeCompare(b[0], "id");
    })
    .map(([, groupRows]) => groupRows);
}

function rowToCells(nomorUrut: number, r: KramaListItem): string[] {
  return [
    String(nomorUrut),
    r.nomor_kartu,
    r.kepala_nama,
    r.jenis_nama ?? "—",
    formatStatusPipilRow(r),
    formatTanggalLahir(r.tanggal_terdaftar),
  ];
}

function compareMipilRow(a: KramaListItem, b: KramaListItem): number {
  return compareKramaWilayah(a, b);
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

function formatJenisBandLabel(jenisNama: string): string {
  const n = jenisNama.trim() || "—";
  if (/^krama\s/i.test(n)) return `${n} :`;
  return `Krama ${n} :`;
}

function buildGroupedTableRows(
  rows: KramaListItem[],
  rowFontSize: number
): {
  tableRows: string[][];
  groupBandRows: Record<number, string>;
  groupBandFontSize: Record<number, number>;
} {
  const sorted = [...rows].sort(compareMipilRow);
  const tableRows: string[][] = [];
  const groupBandRows: Record<number, string> = {};
  const groupBandFontSize: Record<number, number> = {};
  let nomorUrut = 0;
  let lastBanjarKey = "";
  let lastTempekKey = "";

  type WilayahSection = {
    banjarNama: string;
    tempekNama: string | null | undefined;
    arahanNama: string | null | undefined;
    rows: KramaListItem[];
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
    if (banjarKey !== lastBanjarKey) {
      const idx = tableRows.length;
      groupBandRows[idx] = formatBanjarBandLabel(section.banjarNama);
      groupBandFontSize[idx] = rowFontSize + 2;
      tableRows.push([...EMPTY_ROW]);
      lastBanjarKey = banjarKey;
      lastTempekKey = "";
    }

    const tempekKey = section.tempekNama?.trim() || "—";
    if (tempekKey !== lastTempekKey) {
      const idx = tableRows.length;
      groupBandRows[idx] = formatTempekBandLabel(section.tempekNama);
      groupBandFontSize[idx] = rowFontSize + 1.5;
      tableRows.push([...EMPTY_ROW]);
      lastTempekKey = tempekKey;
      nomorUrut = 0;
    }

    {
      const idx = tableRows.length;
      groupBandRows[idx] = formatArahanBandLabel(section.arahanNama);
      groupBandFontSize[idx] = rowFontSize + 1;
      tableRows.push([...EMPTY_ROW]);
    }

    for (const jenisRows of groupRowsByJenis(section.rows)) {
      const sortedJenisRows = [...jenisRows].sort((a, b) =>
        compareNomorKartu(a.nomor_kartu, b.nomor_kartu)
      );
      const jenisNama = sortedJenisRows[0]?.jenis_nama?.trim() || "—";
      const idx = tableRows.length;
      groupBandRows[idx] = formatJenisBandLabel(jenisNama);
      groupBandFontSize[idx] = rowFontSize + 0.5;
      tableRows.push([...EMPTY_ROW]);

      for (const r of sortedJenisRows) {
        nomorUrut += 1;
        tableRows.push(rowToCells(nomorUrut, r));
      }
    }
  }

  return { tableRows, groupBandRows, groupBandFontSize };
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

export function buildLaporanMipilPdfInput(opts: {
  rows: KramaListItem[];
  ringkasan?: LaporanMipilRingkasan | null;
  metaLines?: string[];
}): LaporanPdfInput {
  const { rows, ringkasan, metaLines } = opts;
  const sorted = [...rows].sort(compareMipilRow);
  const dataCells = sorted.map((r, i) => rowToCells(i + 1, r));
  const rowFontSize = 7;
  const { tableRows, groupBandRows, groupBandFontSize } = buildGroupedTableRows(rows, rowFontSize);
  const summary = ringkasan
    ? [
        `Total krama: ${ringkasan.total_krama}`,
        `Pipil aktif: ${ringkasan.jumlah_pipil_aktif} · Tidak aktif: ${ringkasan.jumlah_pipil_tidak_aktif}`,
      ]
    : undefined;
  const maxNomorUrut = (() => {
    const counts = new Map<string, number>();
    for (const r of sorted) {
      const key = `${r.banjar_nama.trim() || "—"}|${r.tempek_nama?.trim() || "—"}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Math.max(1, ...counts.values());
  })();
  const noDigits = String(maxNomorUrut).length;

  return {
    filename: "laporan-krama-mipil",
    judul: "Laporan Krama Mipil",
    periode: "Data keanggotaan aktif (filter saat ini)",
    metaLines: metaLines?.length ? metaLines : undefined,
    headers: [...HEADERS],
    rows: tableRows,
    groupBandRows,
    groupBandFontSize,
    summaryLines: summary,
    compactColumns: [0],
    compactColumnExtraPt: { 0: Math.max(4, (noDigits - 1) * 5) - 5 },
    columnFractions: buildDataColumnFractions(HEADERS, dataCells),
    columnWidthExtraPt: { 1: 15 },
    alignRight: [0],
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
