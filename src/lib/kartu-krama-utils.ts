import type { AnggotaKeluarga, KramaDetail } from "./types";
import { formatTanggalLahir } from "./utils";

/** NIK atau NIKA anggota untuk kartu Tamiu. */
export function kartuNikAnggota(anggota: AnggotaKeluarga): string {
  return (
    anggota.nika?.trim() ||
    anggota.nik_atau_nika?.trim() ||
    anggota.nik_kependudukan?.trim() ||
    ""
  );
}

/** Tempek dan banjar digabung untuk field Tempek/Banjar di kartu Tamiu. */
export function kartuTempekBanjar(krama: KramaDetail): string {
  const tempek = krama.tempek_nama?.trim();
  const banjar = krama.banjar_nama?.trim();
  if (tempek && banjar) return `${tempek}, ${banjar}`;
  return tempek || banjar || "";
}

/** Daerah asal untuk kartu Tamiu (gabungan desa/kec/kab/prov). */
export function kartuDaerahAsal(krama: KramaDetail): string {
  return [krama.asal_desa_adat, krama.asal_kecamatan, krama.asal_kabupaten, krama.asal_provinsi]
    .filter((s) => s?.trim())
    .join(", ");
}

/** Teks di bawah foto: NEGARA, 03/06/2026 */
export function kartuKecamatanTanggal(
  namaKecamatan: string | undefined | null,
  tanggalTerdaftar: string
): string {
  const kec = namaKecamatan?.trim() ?? "";
  const tgl = formatTanggalLahir(tanggalTerdaftar);
  const hasTgl = tgl !== "—";
  if (kec && hasTgl) return `${kec}, ${tgl}`;
  if (kec) return kec;
  return hasTgl ? tgl : "";
}
