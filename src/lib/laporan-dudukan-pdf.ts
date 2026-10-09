import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah, formatStatusBayarDudukan } from "./dudukan-hitung";
import type { DudukanKramaRow } from "./services/dudukan";
import {
  formatBanjarLaporanNama,
  formatBanjarSubtotalLaporan,
  formatJenisSubtotalLaporan,
  formatKlasifikasiSubtotalLaporan,
} from "./services/laporan-rekap-penerimaan-dudukan";
import { formatTanggalLahir } from "./utils";
import { compareBanjarKode } from "./wilayah-order";

const HEADERS = [
  "No",
  "No. Pemasih",
  "Pengajeg",
  "Tagihan",
  "Dibayar Tagihan",
  "Diterima Periode",
  "Keringanan",
  "Sisa",
  "Status",
  "Keterangan",
] as const;

type MoneySums = {
  tagihan: number;
  dibayar: number;
  diterima: number;
  keringanan: number;
  sisa: number;
};

type LaporanDudukanPdfTableRow =
  | { kind: "banjar-header"; banjar_nama: string }
  | { kind: "klasifikasi-header"; klasifikasi_nama: string }
  | { kind: "jenis-header"; jenis_nama: string }
  | { kind: "detail"; row: DudukanKramaRow }
  | { kind: "jenis-subtotal"; jenis_nama: string; sums: MoneySums }
  | { kind: "klasifikasi-subtotal"; klasifikasi_nama: string; sums: MoneySums }
  | { kind: "banjar-subtotal"; banjar_nama: string; sums: MoneySums }
  | { kind: "grand-total"; sums: MoneySums };

function fmtRp(n: number): string {
  return n > 0 ? formatRupiah(n) : "—";
}

function formatKeteranganKrama(row: DudukanKramaRow): string {
  if (row.status_krama?.trim().toLowerCase() !== "nonaktif") return "—";
  const tanggal = row.tanggal_tidak_aktif?.trim();
  return tanggal
    ? `Nonaktif sejak ${formatTanggalLahir(tanggal)}`
    : "Nonaktif (tanggal tidak tercatat)";
}

function sumMoney(rows: DudukanKramaRow[]): MoneySums {
  return {
    tagihan: rows.reduce((s, r) => s + r.tarif, 0),
    dibayar: rows.reduce((s, r) => s + r.dibayar, 0),
    diterima: rows.reduce((s, r) => s + (r.diterima_periode ?? 0), 0),
    keringanan: rows.reduce((s, r) => s + (r.keringanan ?? 0), 0),
    sisa: rows.reduce((s, r) => s + r.sisa, 0),
  };
}

function groupByKey<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function compareNomorKartu(a: string, b: string): number {
  return a.localeCompare(b, "id", { numeric: true });
}

function formatPeriodeLabel(dari?: string, sampai?: string): string {
  const d = dari?.trim();
  const s = sampai?.trim();
  if (d && s) return `${formatTanggalLahir(d)} s.d. ${formatTanggalLahir(s)}`;
  if (d) return `Dari ${formatTanggalLahir(d)}`;
  if (s) return `Sampai ${formatTanggalLahir(s)}`;
  return "Bulan berjalan";
}

function exportSlug(dari?: string, sampai?: string): string {
  return dari?.trim() || sampai?.trim()
    ? `${dari?.trim() || "awal"}_${sampai?.trim() || "akhir"}`
    : "bulan-ini";
}

function sumsToCells(label: string, sums: MoneySums): (string | number)[] {
  return [
    label,
    "",
    "",
    fmtRp(sums.tagihan),
    fmtRp(sums.dibayar),
    fmtRp(sums.diterima),
    fmtRp(sums.keringanan),
    fmtRp(sums.sisa),
    "",
    "",
  ];
}

export function buildLaporanDudukanTableRows(rows: DudukanKramaRow[]): LaporanDudukanPdfTableRow[] {
  const out: LaporanDudukanPdfTableRow[] = [];

  const banjarGroups = [...groupByKey(rows, (r) => r.banjar_id).entries()]
    .map(([, banjarRows]) => ({
      kode: banjarRows[0]!.banjar_kode,
      nama: banjarRows[0]!.banjar_nama,
      rows: banjarRows,
    }))
    .sort((a, b) => compareBanjarKode(a.kode, b.kode));

  for (const banjar of banjarGroups) {
    out.push({ kind: "banjar-header", banjar_nama: banjar.nama });

    const klasifikasiGroups = [...groupByKey(banjar.rows, (r) => r.klasifikasi_kode).entries()]
      .map(([, klasRows]) => ({
        nama: klasRows[0]!.klasifikasi_nama,
        rows: klasRows,
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

    for (const klas of klasifikasiGroups) {
      out.push({ kind: "klasifikasi-header", klasifikasi_nama: klas.nama });

      const jenisGroups = [...groupByKey(klas.rows, (r) => r.jenis_nama).entries()]
        .map(([, jenisRows]) => ({
          nama: jenisRows[0]!.jenis_nama,
          rows: jenisRows,
        }))
        .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

      for (const jenis of jenisGroups) {
        out.push({ kind: "jenis-header", jenis_nama: jenis.nama });

        const sorted = [...jenis.rows].sort((a, b) =>
          compareNomorKartu(a.nomor_kartu, b.nomor_kartu)
        );
        for (const row of sorted) {
          out.push({ kind: "detail", row });
        }

        out.push({
          kind: "jenis-subtotal",
          jenis_nama: jenis.nama,
          sums: sumMoney(jenis.rows),
        });
      }

      out.push({
        kind: "klasifikasi-subtotal",
        klasifikasi_nama: klas.nama,
        sums: sumMoney(klas.rows),
      });
    }

    out.push({
      kind: "banjar-subtotal",
      banjar_nama: banjar.nama,
      sums: sumMoney(banjar.rows),
    });
  }

  out.push({ kind: "grand-total", sums: sumMoney(rows) });
  return out;
}

export function buildLaporanDudukanPdfInput(opts: {
  rows: DudukanKramaRow[];
  ringkasan?: {
    total_tagihan: number;
    total_dibayar: number;
    total_diterima: number;
    total_keringanan: number;
    total_sisa: number;
  } | null;
  dari?: string;
  sampai?: string;
}): LaporanPdfInput {
  const { rows, ringkasan, dari, sampai } = opts;
  const tableRows = buildLaporanDudukanTableRows(rows);
  const periodeLabel = formatPeriodeLabel(dari, sampai);
  const rowFontSize = 8;
  const groupBandRows: Record<number, string> = {};
  const groupBandFontSize: Record<number, number> = {};
  const spacerRows: number[] = [];
  const boldRows: number[] = [];
  const highlightRows: number[] = [];
  const rowCellMerges: Record<number, Partial<Record<number, number>>> = {};
  const rowAlignCenter: Record<number, number[]> = {};
  const mergeLabelCols = { 0: 3 };
  const pdfRows: (string | number)[][] = [];
  const emptyRow = ["", "", "", "", "", "", "", "", "", ""];
  let nomorUrut = 0;
  let pdfIdx = 0;
  let firstBanjar = true;

  for (const row of tableRows) {
    if (row.kind === "banjar-header") {
      if (!firstBanjar) {
        spacerRows.push(pdfIdx);
        pdfRows.push([...emptyRow]);
        pdfIdx++;
      }
      firstBanjar = false;
      groupBandRows[pdfIdx] = formatBanjarLaporanNama(row.banjar_nama);
      groupBandFontSize[pdfIdx] = rowFontSize + 2;
      pdfRows.push([...emptyRow]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "klasifikasi-header") {
      groupBandRows[pdfIdx] = row.klasifikasi_nama;
      pdfRows.push([...emptyRow]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "jenis-header") {
      groupBandRows[pdfIdx] = row.jenis_nama;
      pdfRows.push([...emptyRow]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "detail") {
      nomorUrut += 1;
      const r = row.row;
      pdfRows.push([
        String(nomorUrut),
        r.nomor_kartu,
        r.kepala_nama,
        fmtRp(r.tarif),
        fmtRp(r.dibayar),
        fmtRp(r.diterima_periode ?? 0),
        fmtRp(r.keringanan ?? 0),
        fmtRp(r.sisa),
        formatStatusBayarDudukan(r.tarif, r.dibayar, r.keringanan ?? 0),
        formatKeteranganKrama(r),
      ]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "jenis-subtotal") {
      boldRows.push(pdfIdx);
      rowCellMerges[pdfIdx] = mergeLabelCols;
      rowAlignCenter[pdfIdx] = [0];
      pdfRows.push(sumsToCells(formatJenisSubtotalLaporan(row.jenis_nama), row.sums));
      pdfIdx++;
      continue;
    }
    if (row.kind === "klasifikasi-subtotal") {
      boldRows.push(pdfIdx);
      highlightRows.push(pdfIdx);
      rowCellMerges[pdfIdx] = mergeLabelCols;
      rowAlignCenter[pdfIdx] = [0];
      pdfRows.push(
        sumsToCells(formatKlasifikasiSubtotalLaporan(row.klasifikasi_nama), row.sums)
      );
      pdfIdx++;
      continue;
    }
    if (row.kind === "banjar-subtotal") {
      boldRows.push(pdfIdx);
      highlightRows.push(pdfIdx);
      rowCellMerges[pdfIdx] = mergeLabelCols;
      rowAlignCenter[pdfIdx] = [0];
      pdfRows.push(sumsToCells(formatBanjarSubtotalLaporan(row.banjar_nama), row.sums));
      pdfIdx++;
      continue;
    }

    boldRows.push(pdfIdx);
    rowCellMerges[pdfIdx] = mergeLabelCols;
    rowAlignCenter[pdfIdx] = [0];
    pdfRows.push(sumsToCells("JUMLAH KESELURUHAN", row.sums));
    pdfIdx++;
  }

  const footerIdx = pdfRows.length - 1;
  const summaryLines = ringkasan
    ? [
        `Tagihan: ${formatRupiah(ringkasan.total_tagihan)} · Dibayar tagihan: ${formatRupiah(ringkasan.total_dibayar)} · Diterima periode: ${formatRupiah(ringkasan.total_diterima)} · Keringanan: ${formatRupiah(ringkasan.total_keringanan)} · Sisa: ${formatRupiah(ringkasan.total_sisa)}`,
        "Diterima Periode = uang masuk pada rentang tanggal laporan, dapat mencakup pelunasan tunggakan periode lain.",
      ]
    : undefined;

  return {
    filename: `laporan-dudukan-${exportSlug(dari, sampai)}`,
    judul: "Laporan Dudukan",
    subjudul: "Per Banjar · Klasifikasi · Jenis",
    periode: periodeLabel,
    summaryLines,
    headers: [...HEADERS],
    rows: pdfRows,
    columnFractions: [0.04, 0.11, 0.18, 0.09, 0.09, 0.09, 0.09, 0.09, 0.07, 0.15],
    fixedColumnWidthsPt: {
      0: 22,
      1: 70,
      3: 58,
      4: 58,
      5: 58,
      6: 58,
      7: 58,
      8: 48,
      9: 92,
    },
    alignRight: [0, 3, 4, 5, 6, 7],
    rowCellMerges,
    rowAlignCenter,
    spacerRows,
    groupBandRows,
    groupBandFontSize,
    boldRows,
    highlightRows,
    thickBorderBeforeRows: [footerIdx],
    orientation: "landscape",
    rowFontSize,
    headerFontSize: 8.5,
    wrapColumns: [2, 9],
    tableBottomMarginMm: 5,
    rowLineLeading: 1.2,
    rowPadMm: 1,
    continuationHeaderMm: 4.5,
    summaryFontSize: 9,
    fillPageVertically: true,
  };
}
