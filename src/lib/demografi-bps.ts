/** Kelompok usia standar BPS (interval 5 tahun). */
export const KELOMPOK_USIA_BPS = [
  "0–4",
  "5–9",
  "10–14",
  "15–19",
  "20–24",
  "25–29",
  "30–34",
  "35–39",
  "40–44",
  "45–49",
  "50–54",
  "55–59",
  "60–64",
  "65–69",
  "70–74",
  "75+",
] as const;

export const KELOMPOK_USIA_TIDAK_DIKETAHUI = "Tidak diketahui";

export function usiaKeKelompokBps(umur: number | null | undefined): string {
  if (umur == null || !Number.isFinite(umur) || umur < 0) {
    return KELOMPOK_USIA_TIDAK_DIKETAHUI;
  }
  if (umur >= 75) return "75+";
  const start = Math.floor(umur / 5) * 5;
  const end = start + 4;
  return `${start}–${end}`;
}

export function urutanKelompokUsia(label: string): number {
  const idx = KELOMPOK_USIA_BPS.indexOf(label as (typeof KELOMPOK_USIA_BPS)[number]);
  if (idx >= 0) return idx;
  if (label === KELOMPOK_USIA_TIDAK_DIKETAHUI) return KELOMPOK_USIA_BPS.length;
  return KELOMPOK_USIA_BPS.length + 1;
}
