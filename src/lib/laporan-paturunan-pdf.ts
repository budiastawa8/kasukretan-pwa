import type { Banjar } from "./types";
import { compareArahanRow, compareKramaWilayah } from "./wilayah-order";
import type { LaporanPdfInput } from "./laporan-pdf";
import {
  formatRupiah,
  formatStatusBayarPaturunan,
  statusBayarPaturunan,
  type PaturunanStatusBayar,
} from "./paturunan-hitung";
import type { PaturunanKramaRow } from "./services/paturunan";

export const LAPORAN_PATURUNAN_HEADERS = [
  "No",
  "No. Pipil",
  "Pengarep",
  "Tagihan",
  "Dibayar",
  "Punia",
  "Sisa",
  "Status",
] as const;

/** Kunci status per baris (untuk pewarnaan kolom Status di PDF). */
export type LaporanPaturunanStatusKey = PaturunanStatusBayar | "tidak_wajib";

const JENIS_MIPIL_ORDER = [
  "ngarep jangkep",
  "ngarep balu",
  "ngarep nyapihan",
  "nyada",
] as const;

function resolveBanjarNama(rows: PaturunanKramaRow[], banjarId: string, banjar: Banjar[]): string {
  if (banjarId) {
    const picked = banjar.find((b) => b.id === banjarId);
    if (picked?.nama?.trim()) return picked.nama.trim();
  }
  const names = [...new Set(rows.map((r) => r.banjar_nama?.trim() || "—"))];
  if (names.length === 1) return names[0]!;
  return "SEMUA BANJAR";
}

function resolveTempekNama(rows: PaturunanKramaRow[]): string {
  const names = [
    ...new Set(rows.map((r) => r.tempek_nama?.trim()).filter((n): n is string => !!n)),
  ];
  if (names.length === 1) return names[0]!;
  if (names.length === 0) return "—";
  return "SEMUA TEMPEK";
}

function rowStatusKey(r: PaturunanKramaRow): LaporanPaturunanStatusKey {
  if (r.tagihan == null) return "tidak_wajib";
  return statusBayarPaturunan(r.tagihan, r.dibayar ?? 0, r.punia ?? 0);
}

function normalizeJenisOrderName(nama: string): string {
  return nama.trim().replace(/^krama\s+/i, "").toLowerCase();
}

function jenisMipilRank(nama: string): number {
  const n = normalizeJenisOrderName(nama);
  const idx = JENIS_MIPIL_ORDER.indexOf(n as (typeof JENIS_MIPIL_ORDER)[number]);
  return idx >= 0 ? idx : JENIS_MIPIL_ORDER.length;
}

function formatArahanGroupLabel(arahanNama: string): string {
  return `Arahan : ${arahanNama.trim() || "—"}`;
}

function formatJenisGroupLabel(jenisNama: string): string {
  const n = jenisNama.trim() || "—";
  if (/^krama\s/i.test(n)) return `${n} :`;
  return `Krama ${n} :`;
}

function compareNomorKartu(a: string, b: string): number {
  return a.localeCompare(b, "id", { numeric: true });
}

function compareJenisGroups(a: PaturunanKramaRow[], b: PaturunanKramaRow[]): number {
  const aName = a[0]?.jenis_nama ?? "";
  const bName = b[0]?.jenis_nama ?? "";
  const byRank = jenisMipilRank(aName) - jenisMipilRank(bName);
  if (byRank !== 0) return byRank;
  return aName.localeCompare(bName, "id");
}

function groupByKey(
  rows: PaturunanKramaRow[],
  keyFn: (row: PaturunanKramaRow) => string
): Map<string, PaturunanKramaRow[]> {
  const map = new Map<string, PaturunanKramaRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function groupRowsByJenis(rows: PaturunanKramaRow[]): PaturunanKramaRow[][] {
  return [...groupByKey(rows, (r) => r.jenis_nama?.trim() || "—").values()].sort(
    compareJenisGroups
  );
}

function isEmptyArahanKey(arahanKey: string): boolean {
  const n = arahanKey.trim();
  return !n || n === "—";
}

function compareArahanGroupEntries(
  [, aRows]: [string, PaturunanKramaRow[]],
  [, bRows]: [string, PaturunanKramaRow[]]
): number {
  const a = aRows[0]!;
  const b = bRows[0]!;
  const aKey = a.arahan_nama?.trim() || "—";
  const bKey = b.arahan_nama?.trim() || "—";
  const aEmpty = isEmptyArahanKey(aKey);
  const bEmpty = isEmptyArahanKey(bKey);
  if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
  return compareArahanRow(a, b);
}

function fmtRp(n: number): string {
  return n > 0 ? formatRupiah(n) : "—";
}

/** Persentase terhadap tagihan (1 desimal, id-ID). Tagihan 0 → "—". */
function pctTerhadapTagihan(nilai: number, tagihan: number): string {
  if (tagihan <= 0) return "—";
  const pct = (nilai / tagihan) * 100;
  return `${pct.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function sumArahanMoney(rows: PaturunanKramaRow[]) {
  return {
    tagihan: rows.reduce((s, r) => s + (r.tagihan ?? 0), 0),
    dibayar: rows.reduce((s, r) => s + (r.dibayar ?? 0), 0),
    punia: rows.reduce((s, r) => s + (r.punia ?? 0), 0),
    sisa: rows.reduce((s, r) => s + (r.sisa ?? 0), 0),
  };
}

function buildGroupedTableRows(rows: PaturunanKramaRow[]): {
  tableRows: (string | number)[][];
  groupBandRows: Record<number, string>;
  statusKeys: (LaporanPaturunanStatusKey | undefined)[];
  boldRows: number[];
  highlightRows: number[];
  thickBorderBeforeRows: number[];
} {
  const tableRows: (string | number)[][] = [];
  const groupBandRows: Record<number, string> = {};
  const statusKeys: (LaporanPaturunanStatusKey | undefined)[] = [];
  const boldRows: number[] = [];
  const highlightRows: number[] = [];
  const thickBorderBeforeRows: number[] = [];
  const sortedRows = [...rows].sort(compareKramaWilayah);
  const arahanGroups = [
    ...groupByKey(sortedRows, (r) => r.arahan_nama?.trim() || "—").entries(),
  ].sort(compareArahanGroupEntries);
  let no = 0;
  let lastTempekKey = "";

  const pushSubtotal = (
    cells: (string | number)[],
    opts?: { separatorBefore?: boolean }
  ) => {
    const idx = tableRows.length;
    tableRows.push(cells);
    statusKeys.push(undefined);
    boldRows.push(idx);
    highlightRows.push(idx);
    if (opts?.separatorBefore) thickBorderBeforeRows.push(idx);
  };

  for (const [arahanNama, arahanRows] of arahanGroups) {
    groupBandRows[tableRows.length] = formatArahanGroupLabel(arahanNama);
    tableRows.push([]);
    statusKeys.push(undefined);

    for (const groupRows of groupRowsByJenis(arahanRows)) {
      const sorted = [...groupRows].sort((a, b) =>
        compareNomorKartu(a.nomor_kartu, b.nomor_kartu)
      );
      const jenisNama = sorted[0]?.jenis_nama?.trim() || "—";
      groupBandRows[tableRows.length] = formatJenisGroupLabel(jenisNama);
      tableRows.push([]);
      statusKeys.push(undefined);

      for (const r of sorted) {
        const tempekKey = r.tempek_nama?.trim() || "—";
        if (tempekKey !== lastTempekKey) {
          no = 0;
          lastTempekKey = tempekKey;
        }
        no += 1;
        statusKeys.push(rowStatusKey(r));
        tableRows.push([
          no,
          r.nomor_kartu,
          r.kepala_nama,
          r.tagihan != null ? formatRupiah(r.tagihan) : "—",
          r.dibayar != null ? formatRupiah(r.dibayar) : "—",
          r.punia != null ? formatRupiah(r.punia) : "—",
          r.sisa != null ? formatRupiah(r.sisa) : "—",
          r.tagihan != null
            ? formatStatusBayarPaturunan(r.tagihan, r.dibayar ?? 0, r.punia ?? 0)
            : "—",
        ]);
      }
    }

    const sums = sumArahanMoney(arahanRows);
    pushSubtotal([
      "",
      "",
      `Jumlah Arahan : ${arahanNama}`,
      fmtRp(sums.tagihan),
      fmtRp(sums.dibayar),
      fmtRp(sums.punia),
      fmtRp(sums.sisa),
      "",
    ]);
  }

  const total = sumArahanMoney(sortedRows);
  pushSubtotal(
    [
      "",
      "",
      "JUMLAH KESELURUHAN",
      fmtRp(total.tagihan),
      fmtRp(total.dibayar),
      fmtRp(total.punia),
      fmtRp(total.sisa),
      "",
    ],
    { separatorBefore: true }
  );
  pushSubtotal([
    "",
    "",
    "Dibayar terhadap Tagihan",
    "",
    pctTerhadapTagihan(total.dibayar, total.tagihan),
    "",
    "",
    "",
  ]);
  pushSubtotal([
    "",
    "",
    "Sisa terhadap Tagihan",
    "",
    "",
    "",
    pctTerhadapTagihan(total.sisa, total.tagihan),
    "",
  ]);

  return {
    tableRows,
    groupBandRows,
    statusKeys,
    boldRows,
    highlightRows,
    thickBorderBeforeRows,
  };
}

export function buildLaporanPaturunanPdfInput(opts: {
  rows: PaturunanKramaRow[];
  iuranNama: string;
  banjarId: string;
  banjar: Banjar[];
  filenameSlug: string;
}): LaporanPdfInput {
  const { rows, iuranNama, banjarId, banjar, filenameSlug } = opts;
  const banjarNama = resolveBanjarNama(rows, banjarId, banjar);
  const tempekNama = resolveTempekNama(rows);
  const { tableRows, groupBandRows, statusKeys, boldRows, highlightRows, thickBorderBeforeRows } =
    buildGroupedTableRows(rows);

  return {
    filename: `laporan-paturunan-${filenameSlug}`,
    judul: "Laporan Paturunan",
    subjudul: iuranNama,
    subjudulUppercase: true,
    periode: "",
    metaLines: [`BANJAR ADAT: ${banjarNama}`, `TEMPEK: ${tempekNama}`],
    headers: [...LAPORAN_PATURUNAN_HEADERS],
    rows: tableRows,
    groupBandRows,
    boldRows,
    highlightRows,
    thickBorderBeforeRows,
    compactColumns: [0, 1],
    compactColumnExtraPt: { 0: 5, 1: 30 },
    fixedColumnWidthsPt: { 3: 65, 4: 65, 5: 65, 6: 65, 7: 45 },
    columnFractions: [0, 0, 1, 0, 0, 0, 0, 0],
    alignRight: [0, 3, 4, 5, 6],
    wrapColumns: [2],
    rowFontSize: 8,
    headerFontSize: 8.5,
    statusColumnIndex: 7,
    rowStatusKeys: statusKeys,
    tableFont: "barlow-condensed",
    fillPageVertically: true,
    tableBottomMarginMm: 5,
    rowLineLeading: 1.2,
    rowPadMm: 1,
    continuationHeaderMm: 4.5,
  };
}
