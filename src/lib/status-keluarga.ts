import type { AnggotaDraft, KlasifikasiKode } from "./types";

/** Status kepala untuk Krama Mipil */
export const STATUS_PENGAREP = "Pengarep";

/** Status kepala untuk Krama Tamiu & Tamiu */
export const STATUS_PENGAJEG = "Pengajeg";

export const STATUS_KELUARGA_MIPIL = [
  STATUS_PENGAREP,
  "Suami",
  "Istri",
  "Anak",
  "Ayah",
  "Ibu",
  "Cucu",
  "Mertua",
  "Saudara",
  "Famili lain",
] as const;

export type StatusKeluargaMipil = (typeof STATUS_KELUARGA_MIPIL)[number];

/** Opsi tambah anggota baru — tanpa Pengarep (ditetapkan lewat ubah status) */
export const STATUS_KELUARGA_TAMBAH_ANGGOTA = STATUS_KELUARGA_MIPIL.filter(
  (s) => s !== STATUS_PENGAREP
);

/** Krama Tamiu & Tamiu */
export const STATUS_KELUARGA_PEMASIH = [
  STATUS_PENGAJEG,
  "Suami",
  "Istri",
  "Anak",
  "Istri Siri",
  "Orang Tua",
  "Mertua",
  "Ponakan",
  "Cucu",
  "Saudara",
  "Famili lain",
] as const;

export type StatusKeluargaPemasih = (typeof STATUS_KELUARGA_PEMASIH)[number];

/** Opsi tambah anggota baru — tanpa Pengajeg (ditetapkan lewat field Nama Pengajeg) */
export const STATUS_KELUARGA_TAMBAH_ANGGOTA_PEMASIH = STATUS_KELUARGA_PEMASIH.filter(
  (s) => s !== STATUS_PENGAJEG
);

export function statusKeluargaOptions(kode: KlasifikasiKode): readonly string[] {
  return kode === "MIPIL" ? STATUS_KELUARGA_MIPIL : STATUS_KELUARGA_PEMASIH;
}

/** Opsi status di form/dialog anggota — tanpa status kepala (Pengarep/Pengajeg) */
export function statusKeluargaOptionsAnggota(kode: KlasifikasiKode): readonly string[] {
  return kode === "MIPIL"
    ? STATUS_KELUARGA_TAMBAH_ANGGOTA
    : STATUS_KELUARGA_TAMBAH_ANGGOTA_PEMASIH;
}

/**
 * @deprecated Pengarep/Pengajeg tidak lagi mengubah status_keluarga di draft.
 * Gunakan kepalaAnggotaKey / kepala_penduduk_id.
 */
export function assignDraftGelarKepala(
  list: AnggotaDraft[],
  _memberKey: string,
  _kode: KlasifikasiKode
): AnggotaDraft[] {
  return list;
}

/** Status keluarga untuk tampilan di tabel — nilai asli di database, tanpa mengganti ke Pengarep */
export function formatStatusKeluargaAnggota(status: string, kode: KlasifikasiKode): string {
  const list =
    kode === "MIPIL"
      ? STATUS_KELUARGA_MIPIL
      : kode === "KRAMA_TAMIU" || kode === "TAMIU"
        ? STATUS_KELUARGA_PEMASIH
        : STATUS_KELUARGA_MIPIL;
  const found = list.find((x) => x.toLowerCase() === status.trim().toLowerCase());
  if (found) return found;
  if (status.trim().toLowerCase() === "lainnya") return "Saudara";
  return status;
}

export function isKepalaPenduduk(
  pendudukId: string,
  kepalaPendudukId: string
): boolean {
  return pendudukId === kepalaPendudukId;
}

const LEGACY_KEPALA = "kepala_keluarga";

export function gelarKepalaStatus(kode: KlasifikasiKode): string {
  return kode === "MIPIL" ? STATUS_PENGAREP : STATUS_PENGAJEG;
}

export function gelarKepalaLabel(kode: KlasifikasiKode): string {
  return gelarKepalaStatus(kode);
}

/** Satu status resmi kepala keluarga per klasifikasi */
export function isGelarKepalaStatus(status: string, kode: KlasifikasiKode): boolean {
  const s = status.trim().toLowerCase();
  if (s === LEGACY_KEPALA) return true;
  if (kode === "MIPIL") return s === STATUS_PENGAREP.toLowerCase();
  return s === STATUS_PENGAJEG.toLowerCase();
}

/** @deprecated gunakan isGelarKepalaStatus dengan kode MIPIL */
export function isPengarepStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "pengarep" || s === LEGACY_KEPALA || s === STATUS_PENGAJEG.toLowerCase();
}

export function formatStatusKeluarga(status: string, kode?: KlasifikasiKode): string {
  if (kode === "MIPIL") {
    return formatStatusKeluargaAnggota(status, kode);
  }
  if (kode && isGelarKepalaStatus(status, kode)) {
    return gelarKepalaStatus(kode);
  }
  if (!kode && isPengarepStatus(status)) {
    return STATUS_PENGAREP;
  }
  const list =
    kode === "KRAMA_TAMIU" || kode === "TAMIU"
      ? STATUS_KELUARGA_PEMASIH
      : STATUS_KELUARGA_MIPIL;
  const found = list.find((x) => x.toLowerCase() === status.trim().toLowerCase());
  if (found) return found;
  if (status.trim().toLowerCase() === "lainnya") return "Saudara";
  return status;
}

export function isValidStatusKeluargaMipil(status: string): boolean {
  return (
    STATUS_KELUARGA_MIPIL.some((x) => x.toLowerCase() === status.trim().toLowerCase()) ||
    isGelarKepalaStatus(status, "MIPIL")
  );
}

export function isValidStatusKeluargaPemasih(status: string): boolean {
  return (
    STATUS_KELUARGA_PEMASIH.some((x) => x.toLowerCase() === status.trim().toLowerCase()) ||
    isGelarKepalaStatus(status, "KRAMA_TAMIU") ||
    isGelarKepalaStatus(status, "TAMIU")
  );
}

export function isValidStatusKeluarga(status: string, kode: KlasifikasiKode): boolean {
  return kode === "MIPIL"
    ? isValidStatusKeluargaMipil(status)
    : isValidStatusKeluargaPemasih(status);
}

/** Status pengganti untuk kepala lama (Mipil) — hanya jika memang perlu diganti dari status Pengarep */
export function statusPenggantiPengarep(jenisKelamin: string): StatusKeluargaMipil {
  return jenisKelamin === "L" ? "Ayah" : "Ibu";
}

/** Setelah status Pengarep legacy dihapus — kembali ke peran perkawinan (bukan Ayah/Ibu) */
export function statusSetelahCabutGelarMipil(jenisKelamin: string): "Suami" | "Istri" {
  return jenisKelamin === "L" ? "Suami" : "Istri";
}

export function statusSetelahCabutGelar(jenisKelamin: string, kode: KlasifikasiKode): string {
  if (kode === "MIPIL") return statusSetelahCabutGelarMipil(jenisKelamin);
  return statusPenggantiGelarKepala(jenisKelamin, kode);
}

export type AnggotaNamaStatus = {
  nama_lengkap: string;
  status_keluarga: string;
};

function normalizeStatusKeluargaKey(status: string): string {
  return status.trim().toLowerCase();
}

export function isStatusKeluargaAnak(status: string): boolean {
  return normalizeStatusKeluargaKey(status) === "anak";
}

/** Nama ibu/ayah untuk anak mipil — dari anggota berstatus Istri / Suami di Pipil yang sama. */
export function resolveAnakParentNamesFromPipil(
  members: AnggotaNamaStatus[],
  opts?: { excludeNama?: string }
): { namaIbu: string; namaAyah: string } {
  let namaIbu = "";
  let namaAyah = "";
  const exclude = opts?.excludeNama?.trim().toLowerCase();
  for (const m of members) {
    const nama = m.nama_lengkap.trim();
    if (!nama) continue;
    if (exclude && nama.toLowerCase() === exclude) continue;
    const st = normalizeStatusKeluargaKey(m.status_keluarga);
    if (st === "istri") namaIbu = nama;
    if (st === "suami") namaAyah = nama;
  }
  return { namaIbu, namaAyah };
}

export function statusPenggantiGelarKepala(
  jenisKelamin: string,
  kode: KlasifikasiKode
): string {
  if (kode === "MIPIL") return statusPenggantiPengarep(jenisKelamin);
  return jenisKelamin === "L" ? "Suami" : "Istri";
}

export function isAnggotaGelarKepalaRow(
  pendudukId: string,
  statusKeluarga: string,
  kepalaPendudukId: string,
  kode: KlasifikasiKode
): boolean {
  return pendudukId === kepalaPendudukId || isGelarKepalaStatus(statusKeluarga, kode);
}
