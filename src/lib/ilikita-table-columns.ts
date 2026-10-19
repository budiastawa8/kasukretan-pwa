import type { AnggotaKeluarga, KramaDetail } from "./types";
import { formatStatusKeluargaAnggota } from "./status-keluarga";
import { formatStatusKawin, formatTempatTanggalLahir } from "./utils";
import type { TableColDef } from "./ilikita-pdf-layout";

/** Jumlah baris tetap per halaman tabel Pipil/Pemasih (mirip format KK). */
export const ILIKITA_TABLE_FIXED_ROWS = 8;

/** Slot baris tabel: data anggota atau baris kosong (padding). */
export type IlikitaAnggotaTableSlot = {
  anggota: AnggotaKeluarga;
  absIndex: number;
} | null;

function slot(row: unknown): Exclude<IlikitaAnggotaTableSlot, null> | null {
  if (row == null) return null;
  return row as Exclude<IlikitaAnggotaTableSlot, null>;
}

/**
 * Pecah anggota menjadi halaman berisi tepat `pageSize` baris
 * (padding kosong di akhir halaman; halaman lanjutan jika melebihi).
 */
export function buildIlikitaAnggotaTablePages(
  anggota: AnggotaKeluarga[],
  pageSize = ILIKITA_TABLE_FIXED_ROWS
): IlikitaAnggotaTableSlot[][] {
  const size = Math.max(1, pageSize);
  if (anggota.length === 0) {
    return [Array.from({ length: size }, () => null)];
  }
  const pages: IlikitaAnggotaTableSlot[][] = [];
  for (let start = 0; start < anggota.length; start += size) {
    const slice = anggota.slice(start, start + size);
    const rows: IlikitaAnggotaTableSlot[] = slice.map((a, j) => ({
      anggota: a,
      absIndex: start + j,
    }));
    while (rows.length < size) rows.push(null);
    pages.push(rows);
  }
  return pages;
}

/** Lebar kolom Pipil — proporsi dari pipil-print.css (dinormalisasi). */
export function pipilTableColumns(): TableColDef[] {
  return [
    {
      header: "No",
      widthFrac: 3 / 93,
      align: "center",
      cell: (_i, row) => {
        const s = slot(row);
        return s ? String(s.absIndex + 1) : "";
      },
    },
    {
      header: "Nama",
      widthFrac: 20 / 93,
      align: "left",
      cell: (_i, row) => slot(row)?.anggota.nama_lengkap ?? "",
    },
    {
      header: "L/P",
      widthFrac: 3 / 93,
      align: "center",
      cell: (_i, row) => slot(row)?.anggota.jenis_kelamin ?? "",
    },
    {
      header: "NIKA",
      widthFrac: 10 / 93,
      align: "center",
      cell: (_i, row) => slot(row)?.anggota.nika ?? "",
    },
    {
      header: "Tempat & Tgl. Lahir",
      widthFrac: 13 / 93,
      align: "left",
      cell: (_i, row) => {
        const a = slot(row)?.anggota;
        if (!a) return "";
        return formatTempatTanggalLahir(a.tempat_lahir, a.tanggal_lahir);
      },
    },
    {
      header: "Status Kawin",
      widthFrac: 8 / 93,
      align: "left",
      cell: (_i, row) => {
        const a = slot(row)?.anggota;
        return a ? formatStatusKawin(a.status_kawin) : "";
      },
    },
    {
      header: "Pekerjaan",
      widthFrac: 9 / 93,
      align: "left",
      cell: (_i, row) => slot(row)?.anggota.pekerjaan ?? "",
    },
    {
      header: "Status Keluarga",
      widthFrac: 7 / 93,
      align: "left",
      cell: (_i, row) => slot(row)?.anggota.status_keluarga ?? "",
    },
    {
      header: "Nama Ibu",
      widthFrac: 10 / 93,
      align: "left",
      cell: (_i, row) => slot(row)?.anggota.nama_ibu ?? "",
    },
    {
      header: "Nama Bapak",
      widthFrac: 10 / 93,
      align: "left",
      cell: (_i, row) => slot(row)?.anggota.nama_ayah ?? "",
    },
  ];
}

/** Lebar kolom Pemasih — proporsi dari krama-tamiu-print.css (dinormalisasi). */
export function pemasihTableColumns(
  nikHeader: string,
  klasifikasi: KramaDetail["klasifikasi_kode"]
): TableColDef[] {
  const s = 98;
  return [
    {
      header: "No",
      widthFrac: 4 / s,
      align: "center",
      cell: (_i, row) => {
        const x = slot(row);
        return x ? String(x.absIndex + 1) : "";
      },
    },
    {
      header: "Nama",
      widthFrac: 22 / s,
      align: "left",
      cell: (_i, row) => slot(row)?.anggota.nama_lengkap ?? "",
    },
    {
      header: "L/P",
      widthFrac: 5 / s,
      align: "center",
      cell: (_i, row) => slot(row)?.anggota.jenis_kelamin ?? "",
    },
    {
      header: nikHeader,
      widthFrac: 11 / s,
      align: "center",
      cell: (_i, row) => {
        const a = slot(row)?.anggota;
        if (!a) return "";
        return a.nik_atau_nika?.trim() || a.nika?.trim() || "";
      },
    },
    {
      header: "Tempat & Tgl.Lahir",
      widthFrac: 18 / s,
      align: "left",
      cell: (_i, row) => {
        const a = slot(row)?.anggota;
        if (!a) return "";
        return formatTempatTanggalLahir(a.tempat_lahir, a.tanggal_lahir);
      },
    },
    {
      header: "Status Kawin",
      widthFrac: 12 / s,
      align: "left",
      cell: (_i, row) => {
        const a = slot(row)?.anggota;
        return a ? formatStatusKawin(a.status_kawin) : "";
      },
    },
    {
      header: "Pekerjaan",
      widthFrac: 12 / s,
      align: "left",
      cell: (_i, row) => slot(row)?.anggota.pekerjaan ?? "",
    },
    {
      header: "Status Keluarga",
      widthFrac: 14 / s,
      align: "left",
      cell: (_i, row) => {
        const a = slot(row)?.anggota;
        return a ? formatStatusKeluargaAnggota(a.status_keluarga, klasifikasi) : "";
      },
    },
  ];
}
