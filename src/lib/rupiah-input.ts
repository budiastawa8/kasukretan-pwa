/** Format angka bulat rupiah untuk field input: 50000 → "50.000". */
export function formatRupiahDigits(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "";
  return Math.round(value).toLocaleString("id-ID");
}

/** Parse teks input uang (dengan/tanpa pemisah ribuan) ke angka bulat. */
export function parseRupiahDigits(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

export type RupiahInputValue = number | "";
