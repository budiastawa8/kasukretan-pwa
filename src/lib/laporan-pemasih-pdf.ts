import type { LaporanPdfInput } from "./laporan-pdf";
import { pemasihJenisSortRank } from "./pemasih-jenis";
import { formatBanjarLaporanNama } from "./services/laporan-rekap-penerimaan-dudukan";
import { compareBanjarKode } from "./wilayah-order";
import type {
  LaporanPemasihRingkasan,
  LaporanPemasihRow,
} from "./services/laporan-pemasih";
import type { KlasifikasiKode } from "./types";
import { formatTanggalLahir } from "./utils";

const HEADERS = [
  "No",
  "No. Pemasih",
  "Pengajeg",
  "Alamat",
  "Banjar",
  "Tempek",
  "Status Pemasih",
  "Berlaku S/D",
] as const;

const EMPTY_ROW = ["", "", "", "", "", "", "", ""];

function rowToCells(nomorUrut: number, r: LaporanPemasihRow): string[] {
  return [
    String(nomorUrut),
    r.nomor_kartu,
    r.kepala_nama,
    r.alamat?.trim() || "—",
    r.banjar_nama,
    r.tempek_nama?.trim() || "—",
    r.status_label,
    r.berlaku_sampai ? formatTanggalLahir(r.berlaku_sampai) : "—",
  ];
}

function jenisGroupKey(r: LaporanPemasihRow): string {
  return `${r.klasifikasi_kode}:${r.jenis_nama?.trim() || "—"}`;
}

function comparePemasihRow(a: LaporanPemasihRow, b: LaporanPemasihRow): number {
  const byBanjar = compareBanjarKode(a.banjar_kode ?? "", b.banjar_kode ?? "");
  if (byBanjar !== 0) return byBanjar;

  const byKlas = a.klasifikasi_kode.localeCompare(b.klasifikasi_kode);
  if (byKlas !== 0) return byKlas;

  const kodeA = a.klasifikasi_kode as KlasifikasiKode;
  const kodeB = b.klasifikasi_kode as KlasifikasiKode;
  const byJenisRank =
    pemasihJenisSortRank(kodeA, a.jenis_nama ?? "") -
    pemasihJenisSortRank(kodeB, b.jenis_nama ?? "");
  if (byJenisRank !== 0) return byJenisRank;

  const byJenis = (a.jenis_nama ?? "").localeCompare(b.jenis_nama ?? "", "id");
  if (byJenis !== 0) return byJenis;

  return a.nomor_kartu.localeCompare(b.nomor_kartu, "id", { numeric: true });
}

function formatBanjarBandLabel(banjarNama: string): string {
  return formatBanjarLaporanNama(banjarNama).toLocaleUpperCase("id-ID");
}

function formatKlasifikasiBandLabel(r: LaporanPemasihRow): string {
  return `${r.klasifikasi_nama}:`;
}

function formatJenisBandLabel(r: LaporanPemasihRow): string {
  return r.jenis_nama?.trim() || "—";
}

function buildGroupedTableRows(
  rows: LaporanPemasihRow[],
  rowFontSize: number
): {
  tableRows: string[][];
  groupBandRows: Record<number, string>;
  groupBandFontSize: Record<number, number>;
} {
  const sorted = [...rows].sort(comparePemasihRow);
  const tableRows: string[][] = [];
  const groupBandRows: Record<number, string> = {};
  const groupBandFontSize: Record<number, number> = {};
  let nomorUrut = 0;
  let lastBanjarKey = "";
  let lastKlasifikasiKey = "";
  let lastJenisKey = "";

  for (const r of sorted) {
    const banjarKey = `${r.banjar_kode ?? ""}:${r.banjar_nama.trim() || "—"}`;
    if (banjarKey !== lastBanjarKey) {
      const idx = tableRows.length;
      groupBandRows[idx] = formatBanjarBandLabel(r.banjar_nama);
      groupBandFontSize[idx] = rowFontSize + 2;
      tableRows.push([...EMPTY_ROW]);
      lastBanjarKey = banjarKey;
      lastKlasifikasiKey = "";
      lastJenisKey = "";
    }

    const klasifikasiKey = r.klasifikasi_kode;
    if (klasifikasiKey !== lastKlasifikasiKey) {
      const idx = tableRows.length;
      groupBandRows[idx] = formatKlasifikasiBandLabel(r);
      groupBandFontSize[idx] = rowFontSize + 1.5;
      tableRows.push([...EMPTY_ROW]);
      lastKlasifikasiKey = klasifikasiKey;
      lastJenisKey = "";
    }

    const jenisKey = jenisGroupKey(r);
    if (jenisKey !== lastJenisKey) {
      const idx = tableRows.length;
      groupBandRows[idx] = formatJenisBandLabel(r);
      groupBandFontSize[idx] = rowFontSize + 1;
      tableRows.push([...EMPTY_ROW]);
      lastJenisKey = jenisKey;
    }

    nomorUrut += 1;
    tableRows.push(rowToCells(nomorUrut, r));
  }

  return { tableRows, groupBandRows, groupBandFontSize };
}

/** Bobot lebar kolom dari panjang teks terpanjang (header + isi baris). */
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

export function buildLaporanPemasihPdfInput(opts: {
  rows: LaporanPemasihRow[];
  ringkasan?: LaporanPemasihRingkasan | null;
}): LaporanPdfInput {
  const { rows, ringkasan } = opts;
  const sorted = [...rows].sort(comparePemasihRow);
  const dataCells = sorted.map((r, i) => rowToCells(i + 1, r));
  const rowFontSize = 7;
  const { tableRows, groupBandRows, groupBandFontSize } = buildGroupedTableRows(rows, rowFontSize);
  const summary = ringkasan
    ? [
        `Total: ${ringkasan.total_krama} (KT ${ringkasan.jumlah_kt} · Tamiu ${ringkasan.jumlah_t})`,
        `Aktif: ${ringkasan.jumlah_aktif} · Tidak aktif: ${ringkasan.jumlah_tidak_aktif}`,
      ]
    : undefined;
  const noDigits = rows.length > 0 ? String(rows.length).length : 1;

  return {
    filename: "laporan-pemasih",
    judul: "Laporan Pemasih",
    periode: "Status masa berlaku Krama Tamiu & Tamiu (filter saat ini)",
    headers: [...HEADERS],
    rows: tableRows,
    groupBandRows,
    groupBandFontSize,
    summaryLines: summary,
    compactColumns: [0],
    compactColumnExtraPt: { 0: Math.max(4, (noDigits - 1) * 5) },
    columnFractions: buildDataColumnFractions(HEADERS, dataCells),
    columnWidthExtraPt: { 1: 25, 2: 10, 4: 10, 7: 10 },
    alignRight: [0],
    wrapColumns: [2, 3],
    wrapHeaderColumns: [6],
    rowFontSize,
    headerFontSize: 7.5,
    tableBottomMarginMm: 5,
    rowLineLeading: 1.25,
    rowPadMm: 1.2,
    continuationHeaderMm: 5,
  };
}
