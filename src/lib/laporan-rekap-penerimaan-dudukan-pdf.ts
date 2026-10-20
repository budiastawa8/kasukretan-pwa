import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./dudukan-hitung";
import {
  buildRekapPenerimaanDudukanTableRows,
  buildRekapPenerimaanDudukanTransaksiTableRows,
  buildRekapPenerimaanDudukanPetugasTableRows,
  formatBanjarLaporanNama,
  formatBanjarSubtotalLaporan,
  formatJenisSubtotalLaporan,
  formatKlasifikasiSubtotalLaporan,
  formatPeriodeTransaksiDudukan,
  type RekapPenerimaanDudukan,
  type RekapPenerimaanDudukanTableRow,
  type RekapPenerimaanDudukanTransaksi,
  type RekapPenerimaanDudukanPetugas,
} from "./services/laporan-rekap-penerimaan-dudukan";
import { formatTanggalLahir } from "./utils";

function fmtRp(n: number): string {
  return n > 0 ? formatRupiah(n) : "—";
}

function formatPeriodeLabel(dari?: string, sampai?: string): string {
  const d = dari?.trim();
  const s = sampai?.trim();
  if (d && s) return `Periode: ${formatTanggalLahir(d)} s.d. ${formatTanggalLahir(s)}`;
  if (d) return `Periode: dari ${formatTanggalLahir(d)}`;
  if (s) return `Periode: sampai ${formatTanggalLahir(s)}`;
  return "Periode: semua tanggal";
}

function buildColumnFractions(monthCount: number): number[] {
  const banjarFrac = 0.22;
  const totalFrac = 0.12;
  const rest = 1 - banjarFrac - totalFrac;
  const monthFrac = monthCount > 0 ? rest / monthCount : rest;
  return [banjarFrac, ...Array.from({ length: monthCount }, () => monthFrac), totalFrac];
}

function exportSlug(dari?: string, sampai?: string): string {
  return dari?.trim() || sampai?.trim()
    ? `${dari?.trim() || "awal"}_${sampai?.trim() || "akhir"}`
    : "semua";
}

function tableRowToPdfCells(
  row: RekapPenerimaanDudukanTableRow,
  rekap: RekapPenerimaanDudukan
): string[] {
  if (row.kind === "banjar-header") {
    return [formatBanjarLaporanNama(row.banjar_nama), ...rekap.bulan.map(() => ""), ""];
  }
  if (row.kind === "klasifikasi-header") {
    return [row.klasifikasi_nama, ...rekap.bulan.map(() => ""), ""];
  }
  if (row.kind === "detail") {
    return [
      `    ${row.label}`,
      ...rekap.bulan.map((bk) => fmtRp(row.perBulan[bk] ?? 0)),
      fmtRp(row.total),
    ];
  }
  if (row.kind === "klasifikasi-subtotal") {
    return [
      formatKlasifikasiSubtotalLaporan(row.klasifikasi_nama),
      ...rekap.bulan.map((bk) => fmtRp(row.perBulan[bk] ?? 0)),
      fmtRp(row.total),
    ];
  }
  if (row.kind === "banjar-subtotal") {
    return [
      formatBanjarSubtotalLaporan(row.banjar_nama),
      ...rekap.bulan.map((bk) => fmtRp(row.perBulan[bk] ?? 0)),
      fmtRp(row.total),
    ];
  }
  return [
    "JUMLAH KESELURUHAN",
    ...rekap.bulan.map((bk) => fmtRp(row.perBulan[bk] ?? 0)),
    fmtRp(row.total),
  ];
}

export function buildRekapPenerimaanDudukanPdfInput(
  rekap: RekapPenerimaanDudukan,
  opts: { dari?: string; sampai?: string }
): LaporanPdfInput {
  const tableRows = buildRekapPenerimaanDudukanTableRows(rekap);
  const boldRows: number[] = [];
  const highlightRows: number[] = [];

  const rows = tableRows.map((row, idx) => {
    if (row.kind === "klasifikasi-subtotal" || row.kind === "banjar-subtotal") {
      boldRows.push(idx);
      highlightRows.push(idx);
    }
    if (row.kind === "grand-total") {
      boldRows.push(idx);
    }
    return tableRowToPdfCells(row, rekap);
  });

  const footerIdx = rows.length - 1;
  const monthCount = rekap.bulan.length;
  const alignRight = [
    ...Array.from({ length: monthCount }, (_, i) => i + 1),
    monthCount + 1,
  ];

  return {
    filename: `rekap-penerimaan-dudukan-${exportSlug(opts.dari, opts.sampai)}`,
    judul: "Rekap Penerimaan Dudukan",
    subjudul: "Per Banjar · Klasifikasi · Jenis · Bulan Bayar",
    periode: formatPeriodeLabel(opts.dari, opts.sampai),
    summaryLines: [`Total penerimaan: ${formatRupiah(rekap.grandTotal)}`],
    headers: ["Banjar / Rincian", ...rekap.bulanLabel, "Total"],
    rows,
    columnFractions: buildColumnFractions(monthCount),
    alignRight,
    boldRows,
    highlightRows,
    thickBorderBeforeRows: [footerIdx],
    orientation: "landscape",
    rowFontSize: monthCount > 8 ? 7.5 : 8.5,
    headerFontSize: monthCount > 8 ? 8 : 9,
    wrapColumns: [0],
    tableBottomMarginMm: 5,
    rowLineLeading: 1.15,
    rowPadMm: 0.75,
    continuationHeaderMm: 4.5,
    summaryFontSize: 9,
  };
}

export function buildRekapPenerimaanDudukanTransaksiPdfInput(
  rekap: RekapPenerimaanDudukanTransaksi,
  opts: { dari?: string; sampai?: string }
): LaporanPdfInput {
  const tableRows = buildRekapPenerimaanDudukanTransaksiTableRows(rekap);
  const rowFontSize = 8;
  const groupBandRows: Record<number, string> = {};
  const groupBandFontSize: Record<number, number> = {};
  const spacerRows: number[] = [];
  const boldRows: number[] = [];
  const highlightRows: number[] = [];
  const rowCellMerges: Record<number, Partial<Record<number, number>>> = {};
  const rowAlignCenter: Record<number, number[]> = {};
  const mergeLabelCols = { 0: 4 };
  const subtotalCenterCols = [0, 5];
  const rows: (string | number)[][] = [];
  const emptyRow = ["", "", "", "", "", "", ""];
  let nomorUrut = 0;
  let pdfIdx = 0;
  let firstBanjar = true;

  for (const row of tableRows) {
    if (row.kind === "banjar-header") {
      if (!firstBanjar) {
        spacerRows.push(pdfIdx);
        rows.push([...emptyRow]);
        pdfIdx++;
      }
      firstBanjar = false;
      groupBandRows[pdfIdx] = formatBanjarLaporanNama(row.banjar_nama);
      groupBandFontSize[pdfIdx] = rowFontSize + 2;
      rows.push([...emptyRow]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "klasifikasi-header") {
      groupBandRows[pdfIdx] = row.klasifikasi_nama;
      rows.push([...emptyRow]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "jenis-header") {
      groupBandRows[pdfIdx] = row.jenis_nama;
      rows.push([...emptyRow]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "transaksi") {
      nomorUrut += 1;
      rows.push([
        String(nomorUrut),
        formatTanggalLahir(row.row.tanggal),
        row.row.nomor_kartu,
        row.row.kepala_nama,
        formatPeriodeTransaksiDudukan(row.row.bulan, row.row.tahun),
        fmtRp(row.row.jumlah),
        fmtRp(row.row.keringanan),
      ]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "jenis-subtotal") {
      boldRows.push(pdfIdx);
      rowCellMerges[pdfIdx] = mergeLabelCols;
      rowAlignCenter[pdfIdx] = subtotalCenterCols;
      rows.push([formatJenisSubtotalLaporan(row.jenis_nama), "", "", "", "", fmtRp(row.total), ""]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "klasifikasi-subtotal") {
      boldRows.push(pdfIdx);
      highlightRows.push(pdfIdx);
      rowCellMerges[pdfIdx] = mergeLabelCols;
      rowAlignCenter[pdfIdx] = subtotalCenterCols;
      rows.push([
        formatKlasifikasiSubtotalLaporan(row.klasifikasi_nama),
        "",
        "",
        "",
        "",
        fmtRp(row.total),
        "",
      ]);
      pdfIdx++;
      continue;
    }
    if (row.kind === "banjar-subtotal") {
      boldRows.push(pdfIdx);
      highlightRows.push(pdfIdx);
      rowCellMerges[pdfIdx] = mergeLabelCols;
      rowAlignCenter[pdfIdx] = subtotalCenterCols;
      rows.push([
        formatBanjarSubtotalLaporan(row.banjar_nama),
        "",
        "",
        "",
        "",
        fmtRp(row.total),
        "",
      ]);
      pdfIdx++;
      continue;
    }

    boldRows.push(pdfIdx);
    rowCellMerges[pdfIdx] = mergeLabelCols;
    rowAlignCenter[pdfIdx] = subtotalCenterCols;
    rows.push(["JUMLAH KESELURUHAN", "", "", "", "", fmtRp(row.total), ""]);
    pdfIdx++;
  }

  const footerIdx = rows.length - 1;

  return {
    filename: `rekap-penerimaan-dudukan-transaksi-${exportSlug(opts.dari, opts.sampai)}`,
    judul: "Rekap Penerimaan Dudukan",
    subjudul: "Per Banjar · Klasifikasi · Jenis · Transaksi",
    periode: formatPeriodeLabel(opts.dari, opts.sampai),
    summaryLines: [
      `Total penerimaan: ${formatRupiah(rekap.grandTotal)}`,
      `Jumlah transaksi: ${rekap.transactionCount}`,
    ],
    headers: ["No", "Tanggal", "No. Pemasih", "Pengajeg", "Periode", "Jumlah", "Keringanan"],
    rows,
    columnFractions: [0.06, 0.14, 0.14, 0.36, 0.12, 0.13, 0.13],
    fixedColumnWidthsPt: {
      0: 22,
      1: 65,
      2: 70,
      4: 50,
      5: 65,
      6: 65,
    },
    alignRight: [0, 5, 6],
    rowCellMerges,
    rowAlignCenter,
    spacerRows,
    groupBandFontSize,
    boldRows,
    highlightRows,
    groupBandRows,
    thickBorderBeforeRows: [footerIdx],
    orientation: "portrait",
    rowFontSize,
    headerFontSize: 8.5,
    wrapColumns: [3],
    tableBottomMarginMm: 5,
    rowLineLeading: 1.2,
    rowPadMm: 1,
    continuationHeaderMm: 4.5,
    summaryFontSize: 9,
  };
}

export function buildRekapPenerimaanDudukanPetugasPdfInput(
  rekap: RekapPenerimaanDudukanPetugas,
  opts: {
    dari?: string;
    sampai?: string;
    banjarNama?: string;
    rtBtn?: string;
    tipeLabel?: string;
  }
): LaporanPdfInput {
  const tableRows = buildRekapPenerimaanDudukanPetugasTableRows(rekap);
  const rowFontSize = 11;
  const boldRows: number[] = [];
  const rowCellMerges: Record<number, Partial<Record<number, number>>> = {};
  const rows: (string | number)[][] = [];
  let pdfIdx = 0;

  for (const row of tableRows) {
    if (row.kind === "data") {
      rows.push([formatTanggalLahir(row.tanggal), `  ${row.uraian}`, fmtRp(row.jumlah)]);
      pdfIdx++;
      continue;
    }

    boldRows.push(pdfIdx);
    if (row.kind === "banjar-header") {
      rowCellMerges[pdfIdx] = { 0: 3 };
      rows.push([formatTanggalLahir(row.tanggal), formatBanjarLaporanNama(row.banjar_nama), ""]);
    } else if (row.kind === "tipe-header") {
      rowCellMerges[pdfIdx] = { 0: 3 };
      rows.push(["", row.label, ""]);
    } else if (row.kind === "tipe-subtotal") {
      rows.push(["", row.label, fmtRp(row.total)]);
    } else if (row.kind === "banjar-subtotal") {
      rows.push(["", formatBanjarSubtotalLaporan(row.banjar_nama), fmtRp(row.total)]);
    } else if (row.kind === "tipe-grand-total") {
      rows.push(["", row.label, fmtRp(row.total)]);
    } else {
      rowCellMerges[pdfIdx] = { 0: 2 };
      rows.push(["JUMLAH KESELURUHAN", "", fmtRp(row.total)]);
    }
    pdfIdx++;
  }

  const footerIdx = rows.length - 1;
  const summaryLines = [`Total penerimaan: ${formatRupiah(rekap.grandTotal)}`];
  if (rekap.totalsByTipe.banjar > 0) {
    summaryLines.push(`Tim Banjar: ${formatRupiah(rekap.totalsByTipe.banjar)}`);
  }
  if (rekap.totalsByTipe.bantuan > 0) {
    summaryLines.push(`Tim Bantuan: ${formatRupiah(rekap.totalsByTipe.bantuan)}`);
  }
  if (rekap.totalsByTipe.kantor > 0) {
    summaryLines.push(`Kantor / tanpa petugas: ${formatRupiah(rekap.totalsByTipe.kantor)}`);
  }
  if (rekap.rowCount > 0) {
    summaryLines.push(`Jumlah baris petugas: ${rekap.rowCount}`);
  }
  if (opts.banjarNama?.trim()) {
    summaryLines.push(`Banjar: ${formatBanjarLaporanNama(opts.banjarNama)}`);
  }
  if (opts.rtBtn?.trim()) {
    summaryLines.push(`RT/BTN: ${opts.rtBtn.trim()}`);
  }
  if (opts.tipeLabel?.trim()) {
    summaryLines.push(`Tipe: ${opts.tipeLabel.trim()}`);
  }

  return {
    filename: `rekap-penerimaan-dudukan-petugas-${exportSlug(opts.dari, opts.sampai)}`,
    judul: "Rekap Penerimaan Dudukan",
    subjudul: "Per Tanggal · Banjar · Tim Banjar / Tim Bantuan",
    periode: formatPeriodeLabel(opts.dari, opts.sampai),
    summaryLines,
    headers: ["Tanggal", "Uraian", "Jumlah"],
    rows,
    columnFractions: [0.18, 0.57, 0.25],
    alignRight: [2],
    rowCellMerges,
    boldRows,
    thickBorderBeforeRows: [footerIdx],
    orientation: "portrait",
    rowFontSize,
    headerFontSize: 12,
    wrapColumns: [1],
    tableBottomMarginMm: 5,
    rowLineLeading: 1.2,
    rowPadMm: 1,
    continuationHeaderMm: 4.5,
    summaryFontSize: 9,
  };
}
