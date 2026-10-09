import type { MautsahaAdatStatus } from "./types";
import { today } from "./utils";

const PERPANJANG_REMINDER_HARI = 30;

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function computeMautsahaStatus(
  tanggalBerlakuSampai: string | null,
  hasSurat: boolean
): MautsahaAdatStatus {
  if (!hasSurat || !tanggalBerlakuSampai) return "belum_terbit";
  const hari = today();
  if (tanggalBerlakuSampai >= hari) {
    const sisa = daysBetween(hari, tanggalBerlakuSampai);
    if (sisa <= PERPANJANG_REMINDER_HARI) return "perlu_perpanjang";
    return "berlaku";
  }
  return "kedaluwarsa";
}
