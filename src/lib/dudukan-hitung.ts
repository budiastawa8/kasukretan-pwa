import { dateToIsoLocal, parseIsoDateString } from "./date-iso";
import { hitungBerlakuSampai } from "./masa-berlaku";

export { formatRupiah, parseJumlahPembayaran } from "./paturunan-hitung";
export { formatRupiahDigits, parseRupiahDigits, type RupiahInputValue } from "./rupiah-input";

/** Hari tunggu setelah pencatatan sebelum dudukan boleh dipungut (pencatatan dari tanggal ini). */
export const DUDUKAN_HARI_TUNGGU = 7;

/** Pencatatan sebelum tanggal ini: bulan pertama tagihan = bulan kalender berikutnya. */
export const DUDUKAN_ATURAN_7_HARI_MULAI = "2026-06-01";

/** Batas bulan ke depan bila masa berlaku jenis tidak diisi. */
export const DUDUKAN_MUKA_BULAN_MAX = 12;

const BULAN_NAMA = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const BULAN_NAMA_SINGKAT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

export function parseBulan(value: number): number {
  const n = Math.round(value);
  if (!Number.isFinite(n) || n < 1 || n > 12) {
    throw new Error("Bulan harus antara 1 dan 12");
  }
  return n;
}

export function parseTahun(value: number): number {
  const n = Math.round(value);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) {
    throw new Error("Tahun tidak valid");
  }
  return n;
}

export function bulanSaatIni(): number {
  return new Date().getMonth() + 1;
}

export function tahunSaatIni(): number {
  return new Date().getFullYear();
}

export function formatBulanIndonesia(bulan: number, tahun: number): string {
  return `${BULAN_NAMA[parseBulan(bulan) - 1]} ${parseTahun(tahun)}`;
}

export function formatBulanIndonesiaSingkat(bulan: number, tahun: number): string {
  return `${BULAN_NAMA_SINGKAT[parseBulan(bulan) - 1]} ${parseTahun(tahun)}`;
}

/** Label periode jadwal dudukan, mis. `Jan 25`. */
export function formatPeriodeJadwalDudukan(bulan: number, tahun: number): string {
  return `${BULAN_NAMA_SINGKAT[parseBulan(bulan) - 1]} ${String(parseTahun(tahun)).slice(-2)}`;
}

/** Periode dudukan ringkas untuk tabel riwayat: mm-yyyy */
export function formatPeriodeDudukanMmYyyy(bulan: number, tahun: number): string {
  return `${String(parseBulan(bulan)).padStart(2, "0")}-${parseTahun(tahun)}`;
}

export type PeriodeBulanTahun = { tahun: number; bulan: number };

function periodeUrutKey(p: PeriodeBulanTahun): number {
  return parseTahun(p.tahun) * 100 + parseBulan(p.bulan);
}

/** Rentang periode ringkas, mis. `01-03/25` atau `11/24 s/d 02/25`. */
export function formatPeriodeDudukanRentang(min: PeriodeBulanTahun, max: PeriodeBulanTahun): string {
  const mm = (b: number) => String(parseBulan(b)).padStart(2, "0");
  const yy = (t: number) => String(parseTahun(t)).slice(-2);
  if (min.tahun === max.tahun && min.bulan === max.bulan) {
    return `${mm(min.bulan)}/${yy(min.tahun)}`;
  }
  if (min.tahun === max.tahun) {
    return `${mm(min.bulan)}-${mm(max.bulan)}/${yy(max.tahun)}`;
  }
  return `${mm(min.bulan)}/${yy(min.tahun)} s/d ${mm(max.bulan)}/${yy(max.tahun)}`;
}

/** Gabungkan daftar periode tunggakan menjadi satu label ringkas. */
export function formatTunggakanPeriodeRingkas(periodes: PeriodeBulanTahun[]): string {
  if (!periodes.length) return "—";
  const sorted = [...periodes].sort((a, b) => periodeUrutKey(a) - periodeUrutKey(b));
  return formatPeriodeDudukanRentang(sorted[0]!, sorted[sorted.length - 1]!);
}

export function opsiBulanIndonesia(): { value: number; label: string }[] {
  return BULAN_NAMA.map((label, i) => ({ value: i + 1, label }));
}

export function hitungTagihanDudukan(tarif: number): number {
  const n = Number(tarif);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function mulaiBulanBerikutnyaDariPencatatan(iso: string): PeriodeBulanTahun {
  const [y, m] = iso.split("-").map(Number);
  let bulan = m + 1;
  let tahun = y;
  if (bulan > 12) {
    bulan = 1;
    tahun += 1;
  }
  return { tahun, bulan };
}

/** Pencatatan dari 1 Juni 2026: mulai pungut = pencatatan + 7 hari; sebelum itu bulan tagihan berikutnya. */
export function pakaiAturanHariTungguDudukan(
  tanggalTerdaftar?: string | null
): boolean {
  const iso = parseIsoDateString(tanggalTerdaftar);
  if (!iso) return true;
  return iso >= DUDUKAN_ATURAN_7_HARI_MULAI;
}

/** Tanggal mulai pungut (ISO YYYY-MM-DD) — dasar bulan pertama kewajiban dudukan. */
export function tanggalMulaiPungutDudukan(
  tanggalTerdaftar?: string | null
): string | null {
  const iso = parseIsoDateString(tanggalTerdaftar);
  if (!iso) return null;

  if (!pakaiAturanHariTungguDudukan(iso)) {
    const { tahun, bulan } = mulaiBulanBerikutnyaDariPencatatan(iso);
    return `${tahun}-${String(bulan).padStart(2, "0")}-01`;
  }

  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + DUDUKAN_HARI_TUNGGU);
  return dateToIsoLocal(dt);
}

/** Bulan pertama kewajiban dudukan (bulan kalender dari tanggal mulai pungut). */
export function mulaiDudukanDariTanggal(
  tanggalTerdaftar?: string | null
): PeriodeBulanTahun | null {
  const iso = parseIsoDateString(tanggalTerdaftar);
  if (!iso) return null;

  if (!pakaiAturanHariTungguDudukan(iso)) {
    return mulaiBulanBerikutnyaDariPencatatan(iso);
  }

  const mulai = tanggalMulaiPungutDudukan(iso);
  if (!mulai) return null;
  const [y, m] = mulai.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { tahun: y, bulan: m };
}

export function pesanDudukanBelumBerlakuPeriode(
  tanggalTerdaftar?: string | null
): string {
  if (pakaiAturanHariTungguDudukan(tanggalTerdaftar)) {
    return "Dudukan belum berlaku untuk periode ini (belum 7 hari sejak pencatatan)";
  }
  return "Dudukan belum berlaku untuk periode ini (belum masuk bulan tagihan setelah pencatatan)";
}

/** Apakah periode bulan/tahun sudah masuk kewajiban dudukan (≥ bulan mulai pungut). */
export function isDudukanBerlakuUntukPeriode(
  tanggalTerdaftar: string | null | undefined,
  tahun: number,
  bulan: number
): boolean {
  const mulai = mulaiDudukanDariTanggal(tanggalTerdaftar);
  if (!mulai) return true;
  const y = parseTahun(tahun);
  const m = parseBulan(bulan);
  return y > mulai.tahun || (y === mulai.tahun && m >= mulai.bulan);
}

/** Iterasi periode bulanan dari mulai kewajiban hingga bulan/tahun akhir (inklusif). */
export function iterPeriodeDudukan(
  tanggalTerdaftar: string | null | undefined,
  hinggaTahun: number = tahunSaatIni(),
  hinggaBulan: number = bulanSaatIni()
): PeriodeBulanTahun[] {
  const mulai = mulaiDudukanDariTanggal(tanggalTerdaftar);
  if (!mulai) return [];
  const endY = parseTahun(hinggaTahun);
  const endM = parseBulan(hinggaBulan);
  const out: PeriodeBulanTahun[] = [];
  let y = mulai.tahun;
  let m = mulai.bulan;
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ tahun: y, bulan: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Periode bulan kalender setelah bulan/tahun saat ini (bayar di muka). */
export function isPeriodeDudukanMendatang(tahun: number, bulan: number): boolean {
  const y = parseTahun(tahun);
  const m = parseBulan(bulan);
  const curY = tahunSaatIni();
  const curM = bulanSaatIni();
  return y > curY || (y === curY && m > curM);
}

/** Akhir periode yang boleh dibayar — termasuk bulan mendatang dalam masa berlaku. */
export function akhirPeriodeBayarDudukan(
  tanggalTerdaftar: string | null | undefined,
  tanggalBerlakuMulai?: string | null,
  masaBerlakuTahun?: number | null
): PeriodeBulanTahun {
  const sekarang = { tahun: tahunSaatIni(), bulan: bulanSaatIni() };
  const mulaiBerlaku = tanggalBerlakuMulai?.trim() || tanggalTerdaftar;
  const berlakuSampai = hitungBerlakuSampai(mulaiBerlaku, masaBerlakuTahun);

  if (berlakuSampai) {
    const [y, m] = berlakuSampai.slice(0, 10).split("-").map(Number);
    const akhirMasaBerlaku = { tahun: y, bulan: m };
    if (
      akhirMasaBerlaku.tahun > sekarang.tahun ||
      (akhirMasaBerlaku.tahun === sekarang.tahun && akhirMasaBerlaku.bulan > sekarang.bulan)
    ) {
      return akhirMasaBerlaku;
    }
    return sekarang;
  }

  let y = sekarang.tahun;
  let m = sekarang.bulan + DUDUKAN_MUKA_BULAN_MAX;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { tahun: y, bulan: m };
}

/** Periode masih dalam masa berlaku pemasih (untuk validasi pembayaran). */
export function isPeriodeDudukanDalamMasaBerlaku(
  tanggalTerdaftar: string | null | undefined,
  tanggalBerlakuMulai: string | null | undefined,
  masaBerlakuTahun: number | null | undefined,
  tahun: number,
  bulan: number
): boolean {
  if (!isDudukanBerlakuUntukPeriode(tanggalTerdaftar, tahun, bulan)) return false;
  const mulaiBerlaku = tanggalBerlakuMulai?.trim() || tanggalTerdaftar;
  const berlakuSampai = hitungBerlakuSampai(mulaiBerlaku, masaBerlakuTahun);
  if (!berlakuSampai) return true;
  const [sy, sm] = berlakuSampai.slice(0, 10).split("-").map(Number);
  const y = parseTahun(tahun);
  const m = parseBulan(bulan);
  return y < sy || (y === sy && m <= sm);
}

/** Iterasi periode dudukan untuk pembayaran — termasuk bulan di muka. */
export function iterPeriodeDudukanBayar(
  tanggalTerdaftar: string | null | undefined,
  tanggalBerlakuMulai?: string | null,
  masaBerlakuTahun?: number | null
): PeriodeBulanTahun[] {
  const akhir = akhirPeriodeBayarDudukan(
    tanggalTerdaftar,
    tanggalBerlakuMulai,
    masaBerlakuTahun
  );
  return iterPeriodeDudukan(tanggalTerdaftar, akhir.tahun, akhir.bulan);
}

export function periodeKey(tahun: number | string, bulan: number | string): string {
  return `${parseTahun(Number(tahun))}-${parseBulan(Number(bulan))}`;
}

export function hitungTagihanDudukanPeriode(
  tarif: number,
  tanggalTerdaftar: string | null | undefined,
  tahun: number,
  bulan: number
): number {
  if (!isDudukanBerlakuUntukPeriode(tanggalTerdaftar, tahun, bulan)) return 0;
  return hitungTagihanDudukan(tarif);
}

export function isWajibBayarDudukan(tagihan: number): boolean {
  return tagihan > 0;
}

export function hitungSisaDudukan(
  tagihan: number,
  dibayar: number,
  keringanan = 0
): number {
  return Math.max(
    0,
    Math.round(tagihan) - Math.round(dibayar) - Math.round(keringanan)
  );
}

export function isLunasDudukan(
  tagihan: number,
  dibayar: number,
  keringanan = 0
): boolean {
  if (!isWajibBayarDudukan(tagihan)) return true;
  return Math.round(dibayar) + Math.round(keringanan) >= Math.round(tagihan);
}

export function isLunasKeringananDudukan(
  tagihan: number,
  dibayar: number,
  keringanan = 0
): boolean {
  return (
    isLunasDudukan(tagihan, dibayar, keringanan) &&
    Math.round(keringanan) > 0 &&
    Math.round(dibayar) < Math.round(tagihan)
  );
}

export function isPeriodeDudukanLewat(tahun: number, bulan: number): boolean {
  const y = parseTahun(tahun);
  const m = parseBulan(bulan);
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  return y < curY || (y === curY && m < curM);
}

export function isPeringatanTelatDudukan(
  tahun: number,
  bulan: number,
  tagihan: number,
  dibayar: number,
  keringanan = 0
): boolean {
  return (
    isPeriodeDudukanLewat(tahun, bulan) &&
    isWajibBayarDudukan(tagihan) &&
    !isLunasDudukan(tagihan, dibayar, keringanan)
  );
}

export type DudukanStatusBayar =
  | "tidak_wajib"
  | "lunas"
  | "lunas_keringanan"
  | "cicil"
  | "belum";

export function statusBayarDudukan(
  tagihan: number,
  dibayar: number,
  keringanan = 0
): DudukanStatusBayar {
  if (!isWajibBayarDudukan(tagihan)) return "tidak_wajib";
  if (isLunasKeringananDudukan(tagihan, dibayar, keringanan)) return "lunas_keringanan";
  if (isLunasDudukan(tagihan, dibayar, keringanan)) return "lunas";
  if (dibayar > 0) return "cicil";
  return "belum";
}

export function formatStatusBayarDudukan(
  tagihan: number,
  dibayar: number,
  keringanan = 0
): string {
  switch (statusBayarDudukan(tagihan, dibayar, keringanan)) {
    case "tidak_wajib":
      return "—";
    case "lunas":
      return "Lunas";
    case "lunas_keringanan":
      return "Lunas (R)";
    case "cicil":
      return "Cicil";
    default:
      return "Belum";
  }
}
