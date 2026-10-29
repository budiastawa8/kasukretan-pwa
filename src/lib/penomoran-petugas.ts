import type Database from "./desktop/sql";
import { pad3, pad4 } from "./utils";

export function normalizeKodeDesaUntukPengenal(kode: string | null | undefined): string {
  const digits = String(kode ?? "")
    .trim()
    .replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(0, 4);
  return pad4(digits || "0");
}

/**
 * Nomor pengenal petugas: kode desa adat (4 digit) + urut (3 digit).
 * Penyimpanan tanpa strip: `9999001`. Tampilan: `9999-001`.
 */
export function formatNomorPengenal(kodeDesaAdat: string, urut: number): string {
  const v = Math.max(1, Math.floor(urut));
  if (v > 999) throw new Error("Kuota nomor anggota Tim Kasukretan penuh (maks. 999)");
  return `${normalizeKodeDesaUntukPengenal(kodeDesaAdat)}${pad3(v)}`;
}

/** Tampilkan dengan strip: 9999-001 */
export function formatNomorPengenalDisplay(nomor: string | null | undefined): string {
  const digits = String(nomor ?? "")
    .trim()
    .replace(/\D/g, "");
  if (digits.length >= 7) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 7)}`;
  }
  if (!digits) return "—";
  return digits;
}

/** Ambil urut 3 digit terakhir (mendukung format lama 001). */
export function parseNomorPengenalUrut(nomor: string | null | undefined): number {
  const digits = String(nomor ?? "")
    .trim()
    .replace(/\D/g, "");
  if (!digits) return 0;
  const urutPart = digits.slice(-3);
  const n = Number.parseInt(urutPart, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Apakah nomor sudah pakai format 4+3 dengan kode desa saat ini. */
export function isNomorPengenalFormatBaru(
  nomor: string | null | undefined,
  kodeDesaAdat: string
): boolean {
  const digits = String(nomor ?? "")
    .trim()
    .replace(/\D/g, "");
  if (digits.length !== 7) return false;
  return digits.slice(0, 4) === normalizeKodeDesaUntukPengenal(kodeDesaAdat);
}

/** Ambil nomor urut berikutnya: {kodeDesa}{urut3}. */
export async function nextNomorPengenal(
  db: Database,
  kodeDesaAdat: string
): Promise<string> {
  const kode = normalizeKodeDesaUntukPengenal(kodeDesaAdat);
  const rows = await db.select<{ nomor_pengenal: string | null }[]>(
    `SELECT nomor_pengenal FROM tim_kasukretan WHERE nomor_pengenal IS NOT NULL AND trim(nomor_pengenal) <> ''`
  );
  let max = 0;
  for (const r of rows) {
    max = Math.max(max, parseNomorPengenalUrut(r.nomor_pengenal));
  }
  return formatNomorPengenal(kode, max + 1);
}

export async function resolveKodeDesaAdat(db: Database): Promise<string> {
  const rows = await db.select<{ kode_desa_adat: string | null }[]>(
    `SELECT kode_desa_adat FROM desa_adat LIMIT 1`
  );
  return normalizeKodeDesaUntukPengenal(rows[0]?.kode_desa_adat);
}
