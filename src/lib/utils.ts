import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

export function pad3(n: number | string): string {
  return String(n).padStart(3, "0");
}

export function pad4(n: number | string): string {
  return String(n).padStart(4, "0");
}

export function formatTanggalLahir(tanggal?: string | null): string {
  if (!tanggal) return "—";
  const parts = tanggal.slice(0, 10).split("-");
  if (parts.length !== 3) return tanggal;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

/** Tanggal ringkas dd/mm/yy untuk tabel jadwal dudukan. */
export function formatTanggalSingkat(tanggal?: string | null): string {
  if (!tanggal) return "—";
  const parts = tanggal.slice(0, 10).split("-");
  if (parts.length !== 3) return tanggal;
  const [y, m, d] = parts;
  return `${d}/${m}/${y.slice(-2)}`;
}

export function formatTempatTanggalLahir(
  tempat?: string | null,
  tanggal?: string | null
): string {
  const t = tempat?.trim();
  const tg = tanggal ? formatTanggalLahir(tanggal) : "";
  if (t && tg && tg !== "—") return `${t}, ${tg}`;
  if (t) return t;
  if (tg && tg !== "—") return tg;
  return "";
}

export { formatStatusKawin } from "./status-kawin";

/** Label lengkap untuk cetak Pipil (bagian atas lembar, bukan tabel anggota). */
export function formatJenisKelamin(jenisKelamin?: string | null): string {
  if (!jenisKelamin?.trim()) return "";
  const v = jenisKelamin.trim().toUpperCase();
  if (v === "L") return "Laki-laki";
  if (v === "P") return "Perempuan";
  const lower = jenisKelamin.trim().toLowerCase();
  if (lower === "laki" || lower === "laki-laki") return "Laki-laki";
  if (lower === "perempuan") return "Perempuan";
  return jenisKelamin.trim();
}

/** Umur dalam tahun penuh (dari tanggal lahir ISO) */
export function hitungUmur(tanggalLahir?: string | null): number | null {
  if (!tanggalLahir) return null;
  const born = new Date(`${tanggalLahir.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}
