import type { LaporanPdfInput } from "./laporan-pdf";
import { formatRupiah } from "./paturunan-hitung";
import type { RekapPenerimaanPaturunan } from "./services/laporan-rekap-penerimaan-paturunan";
import { formatTanggalLahir } from "./utils";

function fmtRp(n: number): string {
  return n > 0 ? formatRupiah(n) : "—";
}

export function formatPeriodeRekapLabel(dari?: string, sampai?: string): string {
  const d = dari?.trim();
  const s = sampai?.trim();
  if (d && s) return `Periode: ${formatTanggalLahir(d)} s.d. ${formatTanggalLahir(s)}`;
  if (d) return `Periode: dari ${formatTanggalLahir(d)}`;
  if (s) return `Periode: sampai ${formatTanggalLahir(s)}`;
  return "Periode: semua tanggal";
}

export function buildRekapPenerimaanPaturunanPdfInput(
  rekap: RekapPenerimaanPaturunan,
  opts: { dari?: string; sampai?: string; iuranNama?: string }
): LaporanPdfInput {
  const rows: (string | number)[][] = [];
  const boldRows: number[] = [];
  const highlightRows: number[] = [];
  const thickBorderAfterRows: number[] = [];
  const thickBorderBeforeRows: number[] = [];
  const rowCellMerges: Record<number, Partial<Record<number, number>>> = {};

  function pushSubtotal(
    label: string,
    wajib: number,
    punia: number,
    jumlah: number,
    opts: { separatorAfter?: boolean; separatorBefore?: boolean } = {}
  ) {
    rows.push([label, "", "", fmtRp(wajib), fmtRp(punia), fmtRp(jumlah)]);
    const idx = rows.length - 1;
    rowCellMerges[idx] = { 0: 3 };
    boldRows.push(idx);
    highlightRows.push(idx);
    if (opts.separatorAfter) thickBorderAfterRows.push(idx);
    if (opts.separatorBefore) thickBorderBeforeRows.push(idx);
  }

  for (const b of rekap.banjar) {
    for (const t of b.tempek) {
      for (const a of t.arahan) {
        rows.push([
          b.banjar_nama,
          t.tempek_nama,
          a.arahan_nama,
          fmtRp(a.wajib),
          fmtRp(a.punia),
          fmtRp(a.jumlah),
        ]);
      }
      pushSubtotal(
        `Jumlah Tempek ${t.tempek_nama}`,
        t.wajib,
        t.punia,
        t.jumlah,
        { separatorAfter: true }
      );
    }
    pushSubtotal(
      `Jumlah Banjar ${b.banjar_nama}`,
      b.wajib,
      b.punia,
      b.jumlah,
      { separatorAfter: true }
    );
  }

  pushSubtotal(
    "JUMLAH KESELURUHAN",
    rekap.total_wajib,
    rekap.total_punia,
    rekap.total_jumlah,
    { separatorBefore: true }
  );

  const slug =
    opts.dari?.trim() || opts.sampai?.trim()
      ? `${opts.dari?.trim() || "awal"}_${opts.sampai?.trim() || "akhir"}`
      : "semua";

  const summary = [
    `Transaksi: ${rekap.total_transaksi}`,
    `Total wajib: ${formatRupiah(rekap.total_wajib)} · Punia: ${formatRupiah(rekap.total_punia)} · Jumlah: ${formatRupiah(rekap.total_jumlah)}`,
  ];
  if (opts.iuranNama?.trim()) summary.unshift(`Iuran: ${opts.iuranNama.trim()}`);

  return {
    filename: `rekap-penerimaan-paturunan-${slug}`,
    judul: "Rekap Penerimaan Paturunan",
    periode: formatPeriodeRekapLabel(opts.dari, opts.sampai),
    summaryLines: summary,
    headers: ["Banjar", "Tempek", "Arahan", "Wajib", "Punia", "Jumlah"],
    rows,
    columnFractions: [0.15, 0.165, 0.154, 0.14, 0.14, 0.15],
    alignRight: [3, 4, 5],
    rowCellMerges,
    boldRows,
    highlightRows,
    thickBorderAfterRows,
    thickBorderBeforeRows,
    rowFontSize: 9.5,
    headerFontSize: 10,
    tableBottomMarginMm: 5,
    rowLineLeading: 1.18,
    rowPadMm: 0.9,
    continuationHeaderMm: 4.5,
    summaryFontSize: 9,
    tableFont: "barlow-condensed",
  };
}
