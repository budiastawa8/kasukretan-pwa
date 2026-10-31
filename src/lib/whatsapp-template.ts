import { formatRupiah, formatTunggakanPeriodeRingkas } from "./dudukan-hitung";
import { formatRupiah as formatRupiahPaturunan } from "./paturunan-hitung";
import type { DudukanTunggakanBulan } from "./services/dudukan";

const STORAGE_KEY_TUNGGAKAN = "kasukretan.whatsapp.dudukan.tunggakan";
const STORAGE_KEY_UMUM = "kasukretan.whatsapp.dudukan.umum";
const STORAGE_KEY_PATURUNAN_TUNGGAKAN = "kasukretan.whatsapp.paturunan.tunggakan";
const STORAGE_KEY_PATURUNAN_UMUM = "kasukretan.whatsapp.paturunan.umum";
const STORAGE_KEY_MIPIL_UMUM = "kasukretan.whatsapp.mipil.umum";
const STORAGE_KEY_SETORAN_TELAT = "kasukretan.whatsapp.setoran.telat";

export const DEFAULT_DUDUKAN_TUNGGAKAN_TEMPLATE =
  "Yth. Bapak/Ibu {nama}, dudukan Kasukretan sebesar {total} ({bulan} bulan, periode {periode}) belum lunas. Mohon konfirmasi. Terima kasih.";

export const DEFAULT_DUDUKAN_UMUM_TEMPLATE =
  "Yth. Bapak/Ibu {nama}, terkait dudukan Kasukretan. Mohon konfirmasi. Terima kasih.";

export const DEFAULT_PATURUNAN_TUNGGAKAN_TEMPLATE =
  "Yth. Bapak/Ibu {nama}, paturunan {iuran} sebesar {total} (tagihan {tagihan}) belum lunas. Mohon konfirmasi. Terima kasih.";

export const DEFAULT_PATURUNAN_UMUM_TEMPLATE =
  "Yth. Bapak/Ibu {nama}, terkait paturunan Kasukretan{iuran_suffix}. Mohon konfirmasi. Terima kasih.";

export const DEFAULT_MIPIL_UMUM_TEMPLATE =
  "Yth. Bapak/Ibu {nama}, terkait Krama Mipil Kasukretan. Mohon konfirmasi. Terima kasih.";

/** Pengingat setor petugas (Fonnte / WhatsApp). */
export const DEFAULT_SETORAN_TELAT_TEMPLATE = [
  "Halo {nama},",
  "",
  "Anda masih memegang uang setoran sebesar {total} ({transaksi} transaksi) sejak {tanggal} ({hari} hari).",
  "Mohon segera disetorkan ke bendahara agar masuk buku kas desa.",
  "",
  "Terima kasih.",
].join("\n");

export const WHATSAPP_TEMPLATE_PLACEHOLDERS = [
  { key: "{nama}", desc: "Nama pengajeg" },
  { key: "{total}", desc: "Total sisa (Rp)" },
  { key: "{bulan}", desc: "Jumlah bulan tunggakan" },
  { key: "{periode}", desc: "Rentang periode tunggakan, mis. 01-03/25" },
] as const;

export const MIPIL_WHATSAPP_TEMPLATE_PLACEHOLDERS = [
  { key: "{nama}", desc: "Nama pengarep" },
] as const;

export const SETORAN_TELAT_WHATSAPP_TEMPLATE_PLACEHOLDERS = [
  { key: "{nama}", desc: "Nama petugas Tim Kasukretan" },
  { key: "{total}", desc: "Total uang di tangan (Rp)" },
  { key: "{transaksi}", desc: "Jumlah transaksi belum disetor" },
  { key: "{tanggal}", desc: "Tanggal transaksi tertua (dd/mm/yyyy)" },
  { key: "{hari}", desc: "Berapa hari sejak tanggal tertua" },
] as const;

export const PATURUNAN_WHATSAPP_TEMPLATE_PLACEHOLDERS = [
  { key: "{nama}", desc: "Nama pengarep" },
  { key: "{total}", desc: "Sisa paturunan (Rp)" },
  { key: "{tagihan}", desc: "Tagihan paturunan (Rp)" },
  { key: "{dibayar}", desc: "Sudah dibayar wajib (Rp)" },
  { key: "{iuran}", desc: "Nama iuran paturunan" },
  { key: "{iuran_suffix}", desc: "Cuplikan iuran untuk pesan umum, mis. « (Iuran 2026)»" },
] as const;

function bulanUntukPeriode(bulanTunggakan?: DudukanTunggakanBulan[]): DudukanTunggakanBulan[] {
  const raw = bulanTunggakan ?? [];
  const unpaid = raw.filter((b) => b.sisa > 0 && !b.di_muka);
  return unpaid.length ? unpaid : raw;
}

function formatPeriodeWhatsApp(bulanTunggakan?: DudukanTunggakanBulan[]): string {
  const items = bulanUntukPeriode(bulanTunggakan);
  if (!items.length) return "";
  const periodes = items.map((b) => ({ tahun: b.tahun, bulan: b.bulan }));
  const label = formatTunggakanPeriodeRingkas(periodes);
  return label === "—" ? "" : label;
}

function readTemplate(key: string, fallback: string): string {
  try {
    const raw = localStorage.getItem(key);
    return raw?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export function getDudukanTunggakanTemplate(): string {
  return readTemplate(STORAGE_KEY_TUNGGAKAN, DEFAULT_DUDUKAN_TUNGGAKAN_TEMPLATE);
}

export function getDudukanUmumTemplate(): string {
  return readTemplate(STORAGE_KEY_UMUM, DEFAULT_DUDUKAN_UMUM_TEMPLATE);
}

export function saveDudukanTunggakanTemplate(template: string): void {
  localStorage.setItem(STORAGE_KEY_TUNGGAKAN, template.trim());
}

export function saveDudukanUmumTemplate(template: string): void {
  localStorage.setItem(STORAGE_KEY_UMUM, template.trim());
}

export function resetDudukanWhatsAppTemplates(): void {
  localStorage.removeItem(STORAGE_KEY_TUNGGAKAN);
  localStorage.removeItem(STORAGE_KEY_UMUM);
}

export function getPaturunanTunggakanTemplate(): string {
  return readTemplate(STORAGE_KEY_PATURUNAN_TUNGGAKAN, DEFAULT_PATURUNAN_TUNGGAKAN_TEMPLATE);
}

export function getPaturunanUmumTemplate(): string {
  return readTemplate(STORAGE_KEY_PATURUNAN_UMUM, DEFAULT_PATURUNAN_UMUM_TEMPLATE);
}

export function savePaturunanTunggakanTemplate(template: string): void {
  localStorage.setItem(STORAGE_KEY_PATURUNAN_TUNGGAKAN, template.trim());
}

export function savePaturunanUmumTemplate(template: string): void {
  localStorage.setItem(STORAGE_KEY_PATURUNAN_UMUM, template.trim());
}

export function resetPaturunanWhatsAppTemplates(): void {
  localStorage.removeItem(STORAGE_KEY_PATURUNAN_TUNGGAKAN);
  localStorage.removeItem(STORAGE_KEY_PATURUNAN_UMUM);
}

export function getMipilUmumTemplate(): string {
  return readTemplate(STORAGE_KEY_MIPIL_UMUM, DEFAULT_MIPIL_UMUM_TEMPLATE);
}

export function saveMipilUmumTemplate(template: string): void {
  localStorage.setItem(STORAGE_KEY_MIPIL_UMUM, template.trim());
}

export function resetMipilWhatsAppTemplates(): void {
  localStorage.removeItem(STORAGE_KEY_MIPIL_UMUM);
}

export function getSetoranTelatTemplate(): string {
  return readTemplate(STORAGE_KEY_SETORAN_TELAT, DEFAULT_SETORAN_TELAT_TEMPLATE);
}

export function saveSetoranTelatTemplate(template: string): void {
  localStorage.setItem(STORAGE_KEY_SETORAN_TELAT, template.trim());
}

export function resetSetoranTelatWhatsAppTemplate(): void {
  localStorage.removeItem(STORAGE_KEY_SETORAN_TELAT);
}

export function resetAllWhatsAppTemplates(): void {
  resetDudukanWhatsAppTemplates();
  resetPaturunanWhatsAppTemplates();
  resetMipilWhatsAppTemplates();
  resetSetoranTelatWhatsAppTemplate();
}

export function applyWhatsAppTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export function buildDudukanWhatsAppMessageFromTemplate(params: {
  nama: string;
  tunggakanBulan: number;
  totalSisa: number;
  bulanTunggakan?: DudukanTunggakanBulan[];
}): string {
  const nama = params.nama.trim() || "Bapak/Ibu";
  const hasTunggakan = params.tunggakanBulan > 0 && params.totalSisa > 0;

  if (!hasTunggakan) {
    return applyWhatsAppTemplate(getDudukanUmumTemplate(), { nama });
  }

  const periode = formatPeriodeWhatsApp(params.bulanTunggakan);

  return applyWhatsAppTemplate(getDudukanTunggakanTemplate(), {
    nama,
    total: formatRupiah(params.totalSisa),
    bulan: String(params.tunggakanBulan),
    periode,
  });
}

export function buildPaturunanWhatsAppMessageFromTemplate(params: {
  nama: string;
  sisa: number;
  tagihan: number;
  dibayar?: number;
  iuranNama?: string | null;
}): string {
  const nama = params.nama.trim() || "Bapak/Ibu";
  const iuran = params.iuranNama?.trim() || "";
  const iuranSuffix = iuran ? ` (${iuran})` : "";
  const tagihan = Math.max(0, Math.round(params.tagihan));
  const sisa = Math.max(0, Math.round(params.sisa));
  const hasTunggakan = Boolean(iuran) && tagihan > 0 && sisa > 0;

  if (!hasTunggakan) {
    return applyWhatsAppTemplate(getPaturunanUmumTemplate(), { nama, iuran_suffix: iuranSuffix });
  }

  return applyWhatsAppTemplate(getPaturunanTunggakanTemplate(), {
    nama,
    total: formatRupiahPaturunan(sisa),
    tagihan: formatRupiahPaturunan(tagihan),
    dibayar: formatRupiahPaturunan(Math.max(0, Math.round(params.dibayar ?? 0))),
    iuran,
  });
}

export function buildMipilWhatsAppMessageFromTemplate(params: { nama: string }): string {
  const nama = params.nama.trim() || "Bapak/Ibu";
  return applyWhatsAppTemplate(getMipilUmumTemplate(), { nama });
}

export function buildSetoranTelatWhatsAppMessageFromTemplate(params: {
  nama: string;
  total: number;
  jumlahTransaksi: number;
  tanggalTertua: string;
  hari: number;
}): string {
  const nama = params.nama.trim() || "Petugas";
  return applyWhatsAppTemplate(getSetoranTelatTemplate(), {
    nama,
    total: formatRupiah(params.total),
    transaksi: String(Math.max(0, Math.round(params.jumlahTransaksi))),
    tanggal: params.tanggalTertua,
    hari: String(Math.max(0, Math.round(params.hari))),
  });
}
