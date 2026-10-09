import { statusBayarPaturunan } from "../paturunan-hitung";
import { sortKramaByWilayah } from "../wilayah-order";
import { getLaporanPaturunan, type LaporanPaturunanFilter } from "./laporan-paturunan";
import type { PaturunanKramaRow } from "./paturunan";

export type LaporanTunggakanPaturunanFilter = Omit<LaporanPaturunanFilter, "statusBayar"> & {
  hanyaTelat?: boolean;
};

export type LaporanTunggakanPaturunanRingkasan = {
  iuran_id: string;
  iuran_nama: string;
  total_krama_tunggakan: number;
  total_sisa: number;
  jumlah_telat: number;
  jumlah_belum: number;
  jumlah_cicil: number;
};

function filterTunggakan(
  rows: PaturunanKramaRow[],
  hanyaTelat?: boolean
): PaturunanKramaRow[] {
  return rows.filter((r) => {
    const sisa = r.sisa ?? 0;
    if (sisa <= 0) return false;
    if (hanyaTelat) return Boolean(r.peringatan_telat);
    return true;
  });
}

function hitungRingkasan(
  base: Awaited<ReturnType<typeof getLaporanPaturunan>>["ringkasan"],
  rows: PaturunanKramaRow[]
): LaporanTunggakanPaturunanRingkasan | null {
  if (!base) return null;

  let jumlah_belum = 0;
  let jumlah_cicil = 0;

  for (const r of rows) {
    const tagihan = r.tagihan ?? 0;
    const dibayar = r.dibayar ?? 0;
    const punia = r.punia ?? 0;
    const status = statusBayarPaturunan(tagihan, dibayar, punia);
    if (status === "belum" || status === "punia") jumlah_belum += 1;
    else if (status === "cicil" || status === "cicil_punia") jumlah_cicil += 1;
  }

  return {
    iuran_id: base.iuran_id,
    iuran_nama: base.iuran_nama,
    total_krama_tunggakan: rows.length,
    total_sisa: rows.reduce((s, r) => s + (r.sisa ?? 0), 0),
    jumlah_telat: rows.filter((r) => r.peringatan_telat).length,
    jumlah_belum,
    jumlah_cicil,
  };
}

export async function getLaporanTunggakanPaturunan(
  filter: LaporanTunggakanPaturunanFilter
): Promise<{
  ringkasan: LaporanTunggakanPaturunanRingkasan | null;
  rows: PaturunanKramaRow[];
}> {
  const { hanyaTelat, ...laporanFilter } = filter;
  const { ringkasan: base, rows: all } = await getLaporanPaturunan(laporanFilter);
  const rows = sortKramaByWilayah(filterTunggakan(all, hanyaTelat));
  const ringkasan = hitungRingkasan(base, rows);

  return { ringkasan, rows };
}
