import packageJson from "../../package.json";

/**
 * Identitas produk & vendor — ubah di sini saja.
 * Dipakai panel Pengaturan → Tentang Aplikasi dan footer sidebar.
 */
export const APP_CREDITS = {
  productName: "Aplikasi Kasukretan Krama",
  tagline: "Pencatatan krama desa adat",
  description:
    "Perangkat lunak untuk pencatatan krama mipil, iuran paturunan & dudukan, keuangan desa, surat resmi, dan modul ILIKITA.",
  /** Nama tampilan pemilik / vendor */
  owner: "I Putu Budiastawa",
  /** Nama legal lengkap (jika berbeda); dipakai pernyataan hak cipta formal */
  legalName: "I Putu Budiastawa",
  website: "https://tristamedia.my.id",
  supportEmail: null as string | null,
  copyrightStartYear: 2025,
} as const;

export const APP_VERSION = packageJson.version;

export function appCopyrightLine(now = new Date()): string {
  const year = now.getFullYear();
  const start = APP_CREDITS.copyrightStartYear;
  const years = year > start ? `${start}–${year}` : String(start);
  return `© ${years} ${APP_CREDITS.owner}`;
}

/** Paragraf pernyataan hak cipta & lisensi — tampil di panel Tentang Aplikasi */
export function appCopyrightNoticeParagraphs(now = new Date()): readonly string[] {
  const holder = APP_CREDITS.legalName.trim() || APP_CREDITS.owner;

  return [
    `${APP_CREDITS.productName} adalah program komputer yang dilindungi undang-undang hak cipta Republik Indonesia. Seluruh hak cipta atas perangkat lunak ini (termasuk kode sumber, desain antarmuka, dan dokumentasi) dimiliki oleh ${holder}, kecuali komponen pihak ketiga yang tercantum lisensinya masing-masing.`,
    `Desa adat pembeli memperoleh lisensi penggunaan terbatas, non-eksklusif, dan tidak dapat dialihkan, sesuai kontrak pembelian dan kode aktivasi yang diterbitkan vendor. Lisensi ini tidak menjual atau mengalihkan kepemilikan hak cipta perangkat lunak.`,
    `Data krama, keuangan, surat, dan dokumen yang diinput desa adat tetap menjadi milik desa adat masing-masing. Vendor tidak mengklaim kepemilikan atas isi data operasional desa.`,
    `Dilarang menyalin, mendistribusikan ulang, membongkar (reverse engineering), atau memodifikasi perangkat lunak di luar ruang lingkup lisensi, kecuali diizinkan secara tertulis oleh ${holder}.`,
    `${appCopyrightLine(now)} · ${holder}. Hak cipta dilindungi undang-undang.`,
  ];
}

export function appVersionLabel(): string {
  return `v${APP_VERSION}`;
}
