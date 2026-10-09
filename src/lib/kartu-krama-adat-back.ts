import type { DesaAdat } from "./types";

/** Logo desa adat di kop belakang (10 mm − 10%). */
export const KARTU_BACK_LOGO_MM = 9;
/** Tinggi bar merah atas = tinggi logo. */
export const KARTU_BACK_TOP_BAR_MM = KARTU_BACK_LOGO_MM;
export const KARTU_BACK_FOOTER_BAR_MM = 3.5;
/** Jarak bar merah atas (logo) ke teks Bandesa Adat / KETENTUAN. */
export const KARTU_BACK_BODY_GAP_PT = 10;
/** Ruang tanda tangan antara jabatan dan nama Bandesa (+ tambahan 5 pt). */
export const KARTU_BACK_SIGN_SPACE_MM = 7.5;
export const KARTU_BACK_SIGN_SPACE_EXTRA_PT = 5;
/** Geser tanda tangan Bandesa ke atas (pt) — pratinjau & PDF. */
export const KARTU_BACK_SIGN_SHIFT_UP_PT = 10;
/** Font rincian ketentuan — selaras nilai field di kartu depan (CSS 5,5 pt). */
export const KARTU_BACK_KETENTUAN_FONT_PT = 5.5;
/** Font rincian ketentuan di PDF — selaras drawField depan (6,2 pt). */
export const KARTU_BACK_KETENTUAN_FONT_PDF = 6.2;

/** Teks ketentuan sisi belakang Kartu Krama Adat (Mipil). */
export const KARTU_KRAMA_ADAT_KETENTUAN = [
  "Kartu ini berlaku di wewidangan desa adat dan untuk kepentingan administrasi penataan krama desa adat dalam mewujudkan kasukretan krama",
  "Kartu ini diterbitkan berdasarkan pararem desa adat No. 02 Tahun 2025 tentang Kasukretan Krama di Wewidangan Desa Adat",
  "Pemilik Kartu ini wajib melaksanakan swadarma dan swadikara sesuai awig dan pararem desa adat",
] as const;

export function kartuKramaAdatBandesaJabatan(desa: DesaAdat | null): string {
  return desa?.bandesa_jabatan?.trim() || "Bandesa Adat";
}

export function kartuKramaAdatBandesaNama(desa: DesaAdat | null): string {
  return desa?.bandesa_nama?.trim() || "";
}

/** Nomor call center desa adat — kartu belakang. */
export function kartuKramaAdatCallCenter(desa: DesaAdat | null): string {
  return desa?.call_center?.trim() || "";
}
