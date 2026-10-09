import type { AnggotaKeluarga, KlasifikasiKode, KramaDetail } from "./types";
import { formatTanggalLahir } from "./utils";

export type BerlakuKramaInput = Pick<
  KramaDetail,
  | "masa_berlaku_tahun"
  | "tanggal_terdaftar"
  | "anggota_aktif"
  | "kepala"
  | "tanggal_berlaku_mulai_pemasih"
  | "klasifikasi_kode"
>;

type BerlakuAnggotaInput = Pick<AnggotaKeluarga, "tanggal_pencatatan" | "masuk_pada" | "penduduk_id">;

function isPemasihKode(kode?: KlasifikasiKode | string | null): boolean {
  return kode === "KRAMA_TAMIU" || kode === "TAMIU";
}

/**
 * Tanggal mulai masa berlaku: Pemasih memakai tanggal perpanjangan terakhir bila ada;
 * kartu/Pipil memakai tanggal pencatatan anggota.
 */
export function tanggalBerlakuMulaiIso(
  krama: BerlakuKramaInput,
  anggota?: BerlakuAnggotaInput | null
): string | null {
  if (isPemasihKode(krama.klasifikasi_kode)) {
    const perpanjang = krama.tanggal_berlaku_mulai_pemasih?.trim().slice(0, 10);
    if (perpanjang) return perpanjang;
  }
  return tanggalPencatatanIso(krama, anggota);
}

/** Tanggal pencatatan ISO (YYYY-MM-DD) untuk perhitungan berlaku. */
export function tanggalPencatatanIso(
  krama: BerlakuKramaInput,
  anggota?: BerlakuAnggotaInput | null
): string | null {
  if (anggota) {
    const t = anggota.tanggal_pencatatan?.trim().slice(0, 10);
    if (t) return t;
    const m = anggota.masuk_pada?.trim().slice(0, 10);
    if (m) return m;
    return null;
  }

  const kepalaAnggota = krama.anggota_aktif.find((a) => a.penduduk_id === krama.kepala.id);
  if (kepalaAnggota) {
    const t = kepalaAnggota.tanggal_pencatatan?.trim().slice(0, 10);
    if (t) return t;
    const m = kepalaAnggota.masuk_pada?.trim().slice(0, 10);
    if (m) return m;
  }

  const terdaftar = krama.tanggal_terdaftar?.trim().slice(0, 10);
  return terdaftar || null;
}

/** Nilai kolom Berlaku S/D / Berlaku Sampai / Masa berlaku (format dd/mm/yyyy). */
export function formatBerlakuSdKrama(
  krama: BerlakuKramaInput,
  anggota?: BerlakuAnggotaInput | null
): string {
  return formatBerlakuSampai(tanggalBerlakuMulaiIso(krama, anggota), krama.masa_berlaku_tahun);
}

/** Jenis/krama memiliki masa berlaku aktif (tahun terisi). */
export function hasMasaBerlakuTahun(masaBerlakuTahun: number | null | undefined): boolean {
  return masaBerlakuTahun != null && masaBerlakuTahun >= 1;
}

/** Validasi masa berlaku master (tahun penuh, minimal 1). */
export function parseMasaBerlakuTahun(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new Error("Masa berlaku harus bilangan bulat minimal 1 tahun");
  }
  return n;
}

/**
 * Tanggal berakhirnya masa berlaku dokumen (sehari sebelum ulang tahun ke-N dari tanggal pencatatan).
 * Contoh: pencatatan 2024-06-03 + 1 tahun → berlaku sampai 2025-06-02.
 */
export function hitungBerlakuSampai(
  tanggalPencatatan: string | null | undefined,
  masaBerlakuTahun: number | null | undefined
): string | null {
  if (!tanggalPencatatan?.trim() || masaBerlakuTahun == null || masaBerlakuTahun < 1) {
    return null;
  }
  const iso = tanggalPencatatan.slice(0, 10);
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [y, m, d] = parts;
  const end = new Date(Date.UTC(y + masaBerlakuTahun, m - 1, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** Format tampilan Berlaku S/D untuk cetak (dd/mm/yyyy). */
export function formatBerlakuSampai(
  tanggalPencatatan: string | null | undefined,
  masaBerlakuTahun: number | null | undefined
): string {
  const akhir = hitungBerlakuSampai(tanggalPencatatan, masaBerlakuTahun);
  if (!akhir) return "";
  const tgl = formatTanggalLahir(akhir);
  return tgl === "—" ? "" : tgl;
}
