import { formatBulanIndonesia, formatRupiah } from "./dudukan-hitung";
import type { PetugasStrukPreviewState } from "./petugas-struk-preview";
import type { StrukThermalWidthMm } from "./struk-pembayaran-dudukan-pdf";
import { formatTanggalLahir } from "./utils";

export const STRUK_FOOTER_DUDUKAN = "Terima kasih atas kontribusi anda.";
export const STRUK_FOOTER_PATURUNAN = "Matur Suksma";

export type StrukThermalContent = {
  docTitle: string;
  desaNama: string;
  fields: { label: string; value: string }[];
  tableLeftHeader: string;
  tableRows: { left: string; right: string }[];
  total: string;
  tanggal: string;
  petugas: string;
  footer: string;
};

export function buildStrukThermalContent(
  state: PetugasStrukPreviewState,
  desaNama: string
): StrukThermalContent {
  if (state.kind === "dudukan") {
    const p = state.payload;
    const k = p.krama;
    return {
      docTitle: "BUKTI PEMBAYARAN DUDUKAN",
      desaNama,
      fields: [
        { label: "Nama", value: k.pengajeg_nama },
        { label: "No Pemasih", value: k.nomor_pemasih },
        { label: "Jenis", value: k.jenis_krama },
        { label: "Alamat", value: k.alamat_pemasih },
      ],
      tableLeftHeader: "Periode",
      tableRows: p.items.map((item) => ({
        left: formatBulanIndonesia(item.bulan, item.tahun),
        right: formatRupiah(item.jumlah),
      })),
      total: formatRupiah(p.total),
      tanggal: formatTanggalLahir(p.tanggal),
      petugas: p.petugasNama,
      footer: STRUK_FOOTER_DUDUKAN,
    };
  }

  const p = state.payload;
  const k = p.krama;
  const lokasi = [k.banjar_nama, k.tempek_nama?.trim(), k.arahan_nama?.trim()]
    .filter(Boolean)
    .join(" · ");

  const tableRows: { left: string; right: string }[] = [];
  if (p.wajib > 0) tableRows.push({ left: "Paturunan wajib", right: formatRupiah(p.wajib) });
  if (p.punia > 0) tableRows.push({ left: "Punia (sukarela)", right: formatRupiah(p.punia) });
  if (!tableRows.length) tableRows.push({ left: "Pembayaran", right: formatRupiah(p.total) });

  return {
    docTitle: "BUKTI PEMBAYARAN PATURUNAN",
    desaNama,
    fields: [
      { label: "Nama", value: k.kepala_nama },
      { label: "No Pemasih", value: k.nomor_kartu },
      { label: "Jenis", value: k.jenis_nama?.trim() || "—" },
      { label: "Alamat", value: lokasi || "—" },
      { label: "Iuran", value: p.iuranNama },
    ],
    tableLeftHeader: "Rincian",
    tableRows,
    total: formatRupiah(p.total),
    tanggal: formatTanggalLahir(p.tanggal),
    petugas: p.petugasNama,
    footer: STRUK_FOOTER_PATURUNAN,
  };
}

/** Lebar karakter Font A umum untuk kertas thermal. */
export function thermalCharWidth(widthMm: StrukThermalWidthMm): number {
  return widthMm === 58 ? 32 : 48;
}
