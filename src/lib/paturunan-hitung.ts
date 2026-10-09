import { dateToIsoLocal, parseIsoDateString } from "./date-iso";
import type { PaturunanPembayaranJenis } from "./types";

export function parsePaturunanPersen(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("Persentase paturunan harus antara 0 dan 100");
  }
  return value;
}

export function hitungTagihanPaturunan(nominal: number, persen: number): number {
  const n = Number(nominal);
  const p = Number(persen);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.round((n * p) / 100);
}

/**
 * Persen paturunan krama untuk satu iuran, mengikuti masa Nyada:
 * - iuran jatuh tempo sebelum `nyadaSejak` → persen jenis sebelum Nyada;
 * - iuran jatuh tempo dalam masa Nyada (sebelum `nyadaSampai`) → persen Nyada;
 * - selebihnya (termasuk iuran tanpa tanggal target) → persen jenis saat ini.
 */
export function resolvePersenPaturunanIuran(params: {
  persen: number | null | undefined;
  persenSebelumNyada?: number | null;
  nyadaSejak?: string | null;
  persenNyada?: number | null;
  nyadaSampai?: string | null;
  tanggalTarget?: string | null;
}): number {
  const persen = Number(params.persen) || 0;
  const target = parseIsoDateString(params.tanggalTarget);
  if (!target) return persen;
  const sejak = parseIsoDateString(params.nyadaSejak);
  if (sejak && target < sejak) {
    return params.persenSebelumNyada == null ? persen : Number(params.persenSebelumNyada) || 0;
  }
  const sampai = parseIsoDateString(params.nyadaSampai);
  if (sampai && target < sampai && params.persenNyada != null) {
    return Number(params.persenNyada) || 0;
  }
  return persen;
}

export function formatRupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

export function parseNominalIuran(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Nominal iuran tidak boleh negatif");
  }
  return Math.round(value);
}

export function parseTanggalTarget(value: string | null | undefined): string {
  const iso = parseIsoDateString(value);
  if (!iso) throw new Error("Tanggal target wajib diisi dan harus valid");
  return iso;
}

export function parsePembayaranJenis(value: string): PaturunanPembayaranJenis {
  if (value === "punia") return "punia";
  if (value === "wajib") return "wajib";
  throw new Error("Jenis pembayaran tidak valid");
}

/** Hari ini (lokal) sudah lewat tanggal target (perbandingan YYYY-MM-DD). */
export function isPastTanggalTarget(tanggalTarget?: string | null): boolean {
  const target = parseIsoDateString(tanggalTarget);
  if (!target) return false;
  const today = dateToIsoLocal(new Date());
  return today > target;
}

/** Wajib membayar iuran (tagihan > 0). */
export function isWajibBayarPaturunan(tagihan: number): boolean {
  return tagihan > 0;
}

export function hitungSisaPaturunan(tagihan: number, dibayarWajib: number): number {
  return Math.max(0, Math.round(tagihan) - Math.round(dibayarWajib));
}

export function isLunasPaturunan(tagihan: number, dibayarWajib: number): boolean {
  if (!isWajibBayarPaturunan(tagihan)) return true;
  return Math.round(dibayarWajib) >= Math.round(tagihan);
}

export function isBelumLunasPaturunan(tagihan: number, dibayarWajib: number): boolean {
  if (!isWajibBayarPaturunan(tagihan)) return false;
  return !isLunasPaturunan(tagihan, dibayarWajib);
}

/** Alokasi pembayaran baru: porsi wajib (melunasi tagihan) dan punia (sukarela). */
export function alokasiPembayaranBaru(
  tagihan: number,
  dibayarWajib: number,
  jumlahBaru: number
): { wajib: number; punia: number } {
  const jumlah = Math.round(jumlahBaru);
  if (jumlah <= 0) {
    throw new Error("Jumlah pembayaran harus lebih dari 0");
  }
  if (!isWajibBayarPaturunan(tagihan)) {
    return { wajib: 0, punia: jumlah };
  }
  const sisaWajib = hitungSisaPaturunan(tagihan, dibayarWajib);
  const wajib = Math.min(jumlah, sisaWajib);
  const punia = jumlah - wajib;
  return { wajib, punia };
}

export type PaturunanStatusBayar =
  | "tidak_wajib"
  | "lunas"
  | "lunas_punia"
  | "cicil"
  | "cicil_punia"
  | "belum"
  | "punia";

export function statusBayarPaturunan(
  tagihan: number,
  dibayarWajib: number,
  punia: number
): PaturunanStatusBayar {
  if (!isWajibBayarPaturunan(tagihan)) {
    return punia > 0 ? "punia" : "tidak_wajib";
  }
  const lunas = isLunasPaturunan(tagihan, dibayarWajib);
  if (lunas && punia > 0) return "lunas_punia";
  if (lunas) return "lunas";
  if (dibayarWajib > 0 && punia > 0) return "cicil_punia";
  if (dibayarWajib > 0) return "cicil";
  if (punia > 0) return "punia";
  return "belum";
}

export function formatStatusBayarPaturunan(
  tagihan: number,
  dibayarWajib: number,
  punia: number
): string {
  switch (statusBayarPaturunan(tagihan, dibayarWajib, punia)) {
    case "tidak_wajib":
      return "—";
    case "punia":
      return "Punia";
    case "lunas":
      return "Lunas";
    case "lunas_punia":
      return "Lunas +";
    case "cicil":
      return "Cicil";
    case "cicil_punia":
      return "Cicil+Punia";
    default:
      return "Belum";
  }
}

export function parseJumlahPembayaran(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Jumlah pembayaran harus lebih dari 0");
  }
  return Math.round(value);
}

export function isPeringatanTelat(
  tanggalTarget: string | null | undefined,
  tagihan: number,
  dibayarWajib: number
): boolean {
  return isPastTanggalTarget(tanggalTarget) && isBelumLunasPaturunan(tagihan, dibayarWajib);
}
