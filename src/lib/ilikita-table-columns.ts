import type { AnggotaKeluarga, KramaDetail } from "./types";
import { formatStatusKeluargaAnggota } from "./status-keluarga";
import { formatStatusKawin, formatTempatTanggalLahir } from "./utils";
import type { TableColDef } from "./ilikita-pdf-layout";

/** Lebar kolom Pipil — proporsi dari pipil-print.css (dinormalisasi). */
export function pipilTableColumns(): TableColDef[] {
  return [
    { header: "No", widthFrac: 3 / 93, align: "center", cell: (i) => String(i + 1) },
    { header: "Nama", widthFrac: 20 / 93, align: "left", cell: (_, a) => (a as AnggotaKeluarga).nama_lengkap },
    { header: "L/P", widthFrac: 3 / 93, align: "center", cell: (_, a) => (a as AnggotaKeluarga).jenis_kelamin },
    { header: "NIKA", widthFrac: 10 / 93, align: "center", cell: (_, a) => (a as AnggotaKeluarga).nika ?? "" },
    {
      header: "Tempat & Tgl. Lahir",
      widthFrac: 13 / 93,
      align: "left",
      cell: (_, a) => {
        const x = a as AnggotaKeluarga;
        return formatTempatTanggalLahir(x.tempat_lahir, x.tanggal_lahir);
      },
    },
    {
      header: "Status Kawin",
      widthFrac: 8 / 93,
      align: "left",
      cell: (_, a) => formatStatusKawin((a as AnggotaKeluarga).status_kawin),
    },
    { header: "Pekerjaan", widthFrac: 9 / 93, align: "left", cell: (_, a) => (a as AnggotaKeluarga).pekerjaan ?? "" },
    {
      header: "Status Keluarga",
      widthFrac: 7 / 93,
      align: "left",
      cell: (_, a) => (a as AnggotaKeluarga).status_keluarga,
    },
    { header: "Nama Ibu", widthFrac: 10 / 93, align: "left", cell: (_, a) => (a as AnggotaKeluarga).nama_ibu ?? "" },
    { header: "Nama Bapak", widthFrac: 10 / 93, align: "left", cell: (_, a) => (a as AnggotaKeluarga).nama_ayah ?? "" },
  ];
}

/** Lebar kolom Pemasih — proporsi dari krama-tamiu-print.css (dinormalisasi). */
export function pemasihTableColumns(
  nikHeader: string,
  klasifikasi: KramaDetail["klasifikasi_kode"]
): TableColDef[] {
  const s = 98;
  return [
    { header: "No", widthFrac: 4 / s, align: "center", cell: (i) => String(i + 1) },
    { header: "Nama", widthFrac: 22 / s, align: "left", cell: (_, a) => (a as AnggotaKeluarga).nama_lengkap },
    { header: "L/P", widthFrac: 5 / s, align: "center", cell: (_, a) => (a as AnggotaKeluarga).jenis_kelamin },
    {
      header: nikHeader,
      widthFrac: 11 / s,
      align: "center",
      cell: (_, a) => {
        const x = a as AnggotaKeluarga;
        return x.nik_atau_nika?.trim() || x.nika?.trim() || "";
      },
    },
    {
      header: "Tempat & Tgl.Lahir",
      widthFrac: 18 / s,
      align: "left",
      cell: (_, a) => {
        const x = a as AnggotaKeluarga;
        return formatTempatTanggalLahir(x.tempat_lahir, x.tanggal_lahir);
      },
    },
    {
      header: "Status Kawin",
      widthFrac: 12 / s,
      align: "left",
      cell: (_, a) => formatStatusKawin((a as AnggotaKeluarga).status_kawin),
    },
    { header: "Pekerjaan", widthFrac: 12 / s, align: "left", cell: (_, a) => (a as AnggotaKeluarga).pekerjaan ?? "" },
    {
      header: "Status Keluarga",
      widthFrac: 14 / s,
      align: "left",
      cell: (_, a) =>
        formatStatusKeluargaAnggota((a as AnggotaKeluarga).status_keluarga, klasifikasi),
    },
  ];
}
