import { sortKramaByWilayah } from "../wilayah-order";
import { getLaporanPaturunan, type LaporanPaturunanFilter } from "./laporan-paturunan";
import type { PaturunanKramaRow } from "./paturunan";

export type LaporanPuniaFilter = Omit<LaporanPaturunanFilter, "statusBayar">;

export type LaporanPuniaRingkasan = {
  iuran_id: string;
  iuran_nama: string;
  total_krama: number;
  total_punia: number;
  /** Tagihan 0 (Nyada / jenis 0%) yang sudah mepunia. */
  jumlah_tidak_wajib: number;
  /** Jenis wajib yang juga memberi punia (di luar paturunan). */
  jumlah_wajib: number;
};

function filterPunia(rows: PaturunanKramaRow[]): PaturunanKramaRow[] {
  return rows.filter((r) => (r.punia ?? 0) > 0);
}

function hitungRingkasan(
  base: Awaited<ReturnType<typeof getLaporanPaturunan>>["ringkasan"],
  rows: PaturunanKramaRow[]
): LaporanPuniaRingkasan | null {
  if (!base) return null;

  let jumlah_tidak_wajib = 0;
  let jumlah_wajib = 0;
  for (const r of rows) {
    if ((r.tagihan ?? 0) <= 0) jumlah_tidak_wajib += 1;
    else jumlah_wajib += 1;
  }

  return {
    iuran_id: base.iuran_id,
    iuran_nama: base.iuran_nama,
    total_krama: rows.length,
    total_punia: rows.reduce((s, r) => s + (r.punia ?? 0), 0),
    jumlah_tidak_wajib,
    jumlah_wajib,
  };
}

/** Daftar krama yang sudah mepunia (Nyada maupun jenis wajib) — tanpa fokus tagihan/paturunan. */
export async function getLaporanPunia(filter: LaporanPuniaFilter): Promise<{
  ringkasan: LaporanPuniaRingkasan | null;
  rows: PaturunanKramaRow[];
}> {
  const { ringkasan: base, rows: all } = await getLaporanPaturunan(filter);
  const rows = sortKramaByWilayah(filterPunia(all));
  const ringkasan = hitungRingkasan(base, rows);
  return { ringkasan, rows };
}
