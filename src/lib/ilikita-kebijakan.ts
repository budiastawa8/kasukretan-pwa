import type { DesaAdat, KlasifikasiKode } from "./types";

/** Berlakukan masa berlaku Pipil (penurunan status & tampilan Berlaku S/D). Default: ya. */
export function isEnforceMasaBerlakuPipil(desa: DesaAdat | null | undefined): boolean {
  if (!desa) return true;
  return desa.enforce_masa_berlaku_pipil !== 0;
}

/** Perpanjang Pemasih Krama Tamiu otomatis saat masa habis. Default: tidak. */
export function isAutoPerpanjangPemasih(desa: DesaAdat | null | undefined): boolean {
  return desa?.auto_perpanjang_pemasih === 1;
}

/** Perpanjang Pemasih Tamiu otomatis saat masa habis. Default: tidak. */
export function isAutoPerpanjangPemasihTamiu(desa: DesaAdat | null | undefined): boolean {
  return desa?.auto_perpanjang_pemasih_tamiu === 1;
}

export type AutoPerpanjangPemasihKrama = {
  klasifikasi_kode?: KlasifikasiKode | string | null;
  masa_berlaku_tahun?: number | null;
  /** 1 = jenis Pemasih ini diperpanjang otomatis (dari master jenis). */
  auto_perpanjang_pemasih?: number | null;
};

/** Perpanjang Pemasih otomatis sesuai jenis (bukan satu saklar untuk semua Tamiu). */
export function isAutoPerpanjangPemasihUntuk(
  krama: AutoPerpanjangPemasihKrama | null | undefined,
  desa?: DesaAdat | null
): boolean {
  if (!krama) return false;
  const kode = krama.klasifikasi_kode;
  if (kode !== "TAMIU" && kode !== "KRAMA_TAMIU") return false;
  if (krama.masa_berlaku_tahun == null || krama.masa_berlaku_tahun <= 0) return false;
  if (krama.auto_perpanjang_pemasih != null) return krama.auto_perpanjang_pemasih === 1;
  if (kode === "TAMIU") return isAutoPerpanjangPemasihTamiu(desa);
  return isAutoPerpanjangPemasih(desa);
}

export function showBerlakuSdPipilCetak(desa: DesaAdat | null | undefined): boolean {
  return isEnforceMasaBerlakuPipil(desa);
}

/** Berlakukan biaya administrasi Pemasih saat terbit/perpanjang manual. Default: tidak. */
export function isChargeBiayaAdminPemasih(desa: DesaAdat | null | undefined): boolean {
  return desa?.charge_biaya_admin_pemasih === 1;
}
