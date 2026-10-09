import { hitungBerlakuSampai, tanggalBerlakuMulaiIso } from "./masa-berlaku";
import {
  formatStatusIlikitaLabel,
  isIlikitaPerpanjanganRelevan,
  isKramaNonaktifTotal,
  statusIlikitaEfektif,
  type StatusIlikitaKode,
} from "./status-ilikita";
import type { KlasifikasiKode, KramaDetail } from "./types";
import { today } from "./utils";

/** Peringatan masa berlaku Pemasih akan habis (hari sebelum tanggal berlaku sampai). */
export const PEMASIH_PERINGATAN_HARI = 30;

export type PemasihPerhatianFilter = "tidak_aktif" | "akan_habis";

export type PemasihPerhatianItem = {
  id: string;
  nomor_kartu: string;
  klasifikasi_kode: KlasifikasiKode;
  klasifikasi_nama: string;
  kepala_nama: string;
  jenis_nama?: string | null;
  banjar_nama: string;
  status_pemasih: StatusIlikitaKode;
  status_label: string;
  berlaku_sampai: string | null;
  hari_tersisa: number | null;
  alasan: "tidak_aktif" | "akan_habis";
};

export function hariMenujuBerlakuSampai(berlakuSampaiIso: string | null | undefined): number | null {
  if (!berlakuSampaiIso?.trim()) return null;
  const end = new Date(`${berlakuSampaiIso.slice(0, 10)}T12:00:00Z`);
  const now = new Date(`${today()}T12:00:00Z`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

/** Pemasih masih aktif dan berlaku sampai dalam ≤ 30 hari (belum lewat). */
export function isPemasihAkanHabis(krama: KramaDetail): boolean {
  if (krama.klasifikasi_kode === "MIPIL") return false;
  if (!isIlikitaPerpanjanganRelevan(krama)) return false;
  if (statusIlikitaEfektif(krama.klasifikasi_kode, krama) !== "aktif") return false;
  const mulai = tanggalBerlakuMulaiIso(krama);
  const akhir = hitungBerlakuSampai(mulai, krama.masa_berlaku_tahun);
  const hari = hariMenujuBerlakuSampai(akhir);
  if (hari == null) return false;
  return hari >= 0 && hari <= PEMASIH_PERINGATAN_HARI;
}

export function buildPemasihPerhatianItem(krama: KramaDetail): PemasihPerhatianItem | null {
  if (krama.klasifikasi_kode !== "KRAMA_TAMIU" && krama.klasifikasi_kode !== "TAMIU") {
    return null;
  }
  if (isKramaNonaktifTotal(krama)) return null;

  const mulai = tanggalBerlakuMulaiIso(krama);
  const berlakuSampai = hitungBerlakuSampai(mulai, krama.masa_berlaku_tahun);
  const hariTersisa = hariMenujuBerlakuSampai(berlakuSampai);
  const status = statusIlikitaEfektif(krama.klasifikasi_kode, krama);

  const tidakAktif = status === "tidak_aktif";
  const akanHabis = isPemasihAkanHabis(krama);
  if (!tidakAktif && !akanHabis) return null;

  return {
    id: krama.id,
    nomor_kartu: krama.nomor_kartu,
    klasifikasi_kode: krama.klasifikasi_kode,
    klasifikasi_nama: krama.klasifikasi_nama,
    kepala_nama: krama.kepala.nama_lengkap,
    jenis_nama: krama.jenis_nama,
    banjar_nama: krama.banjar_nama,
    status_pemasih: status,
    status_label: formatStatusIlikitaLabel(status),
    berlaku_sampai: berlakuSampai,
    hari_tersisa: hariTersisa,
    alasan: tidakAktif ? "tidak_aktif" : "akan_habis",
  };
}

export function kategoriPemasihPerhatian(krama: KramaDetail): {
  tidakAktif: boolean;
  akanHabis: boolean;
} {
  if (isKramaNonaktifTotal(krama)) {
    return { tidakAktif: false, akanHabis: false };
  }
  const status = statusIlikitaEfektif(krama.klasifikasi_kode, krama);
  const tidakAktif = status === "tidak_aktif";
  return {
    tidakAktif,
    akanHabis: !tidakAktif && isPemasihAkanHabis(krama),
  };
}
