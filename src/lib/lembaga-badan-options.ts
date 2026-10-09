export const SEKTOR_UTAMA_OPTIONS = [
  "Pemerintah",
  "Swasta Komersial",
  "Sosial/Non-profit",
] as const;
export type SektorUtama = (typeof SEKTOR_UTAMA_OPTIONS)[number];

export const BENTUK_HUKUM_PEMERINTAH = [
  "Kementerian",
  "Lembaga Negara",
  "Badan Pemerintah",
  "Pemerintah Daerah",
] as const;

export const BENTUK_HUKUM_SWASTA = [
  "Usaha Perorangan",
  "PT",
  "CV",
  "Koperasi",
  "Firma",
] as const;

export const BENTUK_HUKUM_SOSIAL = [
  "Yayasan",
  "Ormas",
  "LSM",
  "Lembaga Adat/Desa",
] as const;

export const FOKUS_BIDANG_PEMERINTAH = [
  "Administrasi Umum & Layanan Sipil",
  "Keamanan, Ketertiban & Pertahanan",
  "Kesehatan Publik",
  "Pendidikan Negeri",
  "Pembangunan Infrastruktur & Lingkungan",
] as const;

export const FOKUS_BIDANG_SWASTA = [
  "Perdagangan & Eceran (Retail)",
  "Kuliner & Akomodasi",
  "Jasa Keuangan Komersial",
  "Fotografi, Desain & Aplikasi Digital",
  "Industri Pengolahan (Manufaktur)",
  "Transportasi & Logistik",
  "Pertanian, Peternakan & Perikanan",
] as const;

export const FOKUS_BIDANG_SOSIAL = [
  "Pendidikan Swasta & Pelatihan",
  "Keagamaan & Urusan Spiritual",
  "Pemberdayaan Masyarakat & Adat",
  "Kemanusiaan & Kesejahteraan Sosial",
  "Lingkungan Hidup & Konservasi",
] as const;

export function getBentukHukumOptions(sektor: SektorUtama): readonly string[] {
  switch (sektor) {
    case "Pemerintah":
      return BENTUK_HUKUM_PEMERINTAH;
    case "Swasta Komersial":
      return BENTUK_HUKUM_SWASTA;
    case "Sosial/Non-profit":
      return BENTUK_HUKUM_SOSIAL;
  }
}

export function getFokusBidangOptions(sektor: SektorUtama): readonly string[] {
  switch (sektor) {
    case "Pemerintah":
      return FOKUS_BIDANG_PEMERINTAH;
    case "Swasta Komersial":
      return FOKUS_BIDANG_SWASTA;
    case "Sosial/Non-profit":
      return FOKUS_BIDANG_SOSIAL;
  }
}

export function isValidSektorUtama(value: string): value is SektorUtama {
  return (SEKTOR_UTAMA_OPTIONS as readonly string[]).includes(value);
}

export function isValidBentukHukum(sektor: SektorUtama, bentuk: string): boolean {
  return getBentukHukumOptions(sektor).includes(bentuk);
}

export function isValidFokusBidang(sektor: SektorUtama, fokus: string): boolean {
  return getFokusBidangOptions(sektor).includes(fokus);
}

export const SEKTOR_SWASTA_KOMERSIAL: SektorUtama = "Swasta Komersial";
