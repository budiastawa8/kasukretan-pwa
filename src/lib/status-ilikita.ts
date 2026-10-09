import {
  hitungBerlakuSampai,
  tanggalBerlakuMulaiIso,
  type BerlakuKramaInput,
} from "./masa-berlaku";
import { normalizeKramaStatus } from "./krama-status";
import { isAutoPerpanjangPemasihUntuk, isEnforceMasaBerlakuPipil } from "./ilikita-kebijakan";
import type { AnggotaKeluarga, DesaAdat, KlasifikasiKode } from "./types";
import { today } from "./utils";

export type StatusIlikitaKode = "aktif" | "tidak_aktif";

export function normalizeStatusIlikita(status?: string | null): StatusIlikitaKode {
  return status?.trim().toLowerCase() === "tidak_aktif" ? "tidak_aktif" : "aktif";
}

export function formatStatusIlikitaLabel(status?: string | null): string {
  return normalizeStatusIlikita(status) === "aktif" ? "Aktif" : "Tidak Aktif";
}

/** Status aktif krama dinonaktifkan (meninggal/pindah) → Pipil & Pemasih ikut nonaktif total. */
export function isKramaNonaktifTotal(krama: { status_krama?: string | null }): boolean {
  return normalizeKramaStatus(krama.status_krama) === "nonaktif";
}

export type StatusIlikitaRow = {
  status_krama?: string | null;
  status_pipil?: string | null;
  status_pemasih?: string | null;
};

/** Status Pipil/Pemasih yang ditampilkan dan dipakai logika perpanjangan. */
export function statusIlikitaEfektif(
  kode: KlasifikasiKode,
  row: StatusIlikitaRow
): StatusIlikitaKode {
  if (isKramaNonaktifTotal(row)) return "tidak_aktif";
  return normalizeStatusIlikita(statusIlikitaFromKrama(kode, row));
}

export function formatStatusIlikitaEfektif(
  kode: KlasifikasiKode,
  row: StatusIlikitaRow
): string {
  return formatStatusIlikitaLabel(statusIlikitaEfektif(kode, row));
}

/** Masa berlaku / perpanjangan tidak berlaku bila krama nonaktif. */
export function isIlikitaPerpanjanganRelevan(krama: StatusIlikitaRow): boolean {
  return !isKramaNonaktifTotal(krama);
}

export function statusIlikitaColumn(kode: KlasifikasiKode): "status_pipil" | "status_pemasih" | null {
  if (kode === "MIPIL") return "status_pipil";
  if (kode === "KRAMA_TAMIU" || kode === "TAMIU") return "status_pemasih";
  return null;
}

export function statusIlikitaFromKrama(
  kode: KlasifikasiKode,
  row: { status_pipil?: string | null; status_pemasih?: string | null }
): string | null | undefined {
  const col = statusIlikitaColumn(kode);
  if (!col) return null;
  return row[col];
}

/** Apakah masa berlaku dokumen sudah lewat (hari ini setelah tanggal berlaku sampai). */
export function isMasaBerlakuHabis(
  krama: BerlakuKramaInput,
  anggota?: Pick<AnggotaKeluarga, "tanggal_pencatatan" | "masuk_pada" | "penduduk_id"> | null
): boolean {
  const mulai = tanggalBerlakuMulaiIso(krama, anggota);
  const akhir = hitungBerlakuSampai(mulai, krama.masa_berlaku_tahun);
  if (!akhir) return false;
  return today() > akhir;
}

/** Tanggal berlaku sampai (ISO) atau null jika tidak dapat dihitung. */
export function tanggalBerlakuAkhirIso(
  krama: BerlakuKramaInput,
  anggota?: Pick<AnggotaKeluarga, "tanggal_pencatatan" | "masuk_pada" | "penduduk_id"> | null
): string | null {
  const mulai = tanggalBerlakuMulaiIso(krama, anggota);
  return hitungBerlakuSampai(mulai, krama.masa_berlaku_tahun);
}

/** Hari ini sudah mencapai atau melewati tanggal berlaku sampai (untuk perpanjangan otomatis). */
export function isMasaBerlakuSiapPerpanjang(
  krama: BerlakuKramaInput,
  anggota?: Pick<AnggotaKeluarga, "tanggal_pencatatan" | "masuk_pada" | "penduduk_id"> | null
): boolean {
  const akhir = tanggalBerlakuAkhirIso(krama, anggota);
  if (!akhir) return false;
  return today() >= akhir;
}

/**
 * Status setelah sinkronisasi: habis → Tidak Aktif;
 * belum habis tetapi sudah Tidak Aktif tetap (menunggu perpanjangan).
 */
export function hitungStatusIlikitaSetelahSync(
  current: StatusIlikitaKode,
  masaHabis: boolean
): StatusIlikitaKode {
  if (masaHabis) return "tidak_aktif";
  return current === "tidak_aktif" ? "tidak_aktif" : "aktif";
}

export type IlikitaPreviewKrama = BerlakuKramaInput & {
  klasifikasi_kode: KlasifikasiKode;
  status_krama?: string | null;
  status_pipil?: string | null;
  status_pemasih?: string | null;
  auto_perpanjang_pemasih?: number | null;
};

/** Hitung status ilikita in-memory (tanpa tulis DB) — untuk daftar/laporan. */
export function previewStatusIlikita(
  krama: IlikitaPreviewKrama,
  desa: DesaAdat | null | undefined
): void {
  if (isKramaNonaktifTotal(krama)) {
    krama.status_pipil = "tidak_aktif";
    krama.status_pemasih = "tidak_aktif";
    return;
  }

  const col = statusIlikitaColumn(krama.klasifikasi_kode);
  if (!col) return;

  if (
    col === "status_pemasih" &&
    isAutoPerpanjangPemasihUntuk(krama, desa) &&
    isMasaBerlakuSiapPerpanjang(krama)
  ) {
    const akhir = tanggalBerlakuAkhirIso(krama);
    if (akhir) {
      krama.tanggal_berlaku_mulai_pemasih = akhir;
      krama.status_pemasih = "aktif";
      return;
    }
  }

  const current = normalizeStatusIlikita(
    statusIlikitaFromKrama(krama.klasifikasi_kode, krama)
  );
  const enforcePipil = col !== "status_pipil" || isEnforceMasaBerlakuPipil(desa);
  const habis = enforcePipil && isMasaBerlakuHabis(krama);
  const next = hitungStatusIlikitaSetelahSync(current, habis);
  if (col === "status_pipil") krama.status_pipil = next;
  else krama.status_pemasih = next;
}
