import { statusBayarPaturunan, type PaturunanStatusBayar } from "../paturunan-hitung";
import {
  getRingkasanIuran,
  listKramaPaturunan,
  type PaturunanKramaRow,
  type RingkasanIuran,
} from "./paturunan";

export type LaporanPaturunanStatusFilter = PaturunanStatusBayar | "telat";

export type LaporanPaturunanFilter = {
  iuranId: string;
  banjarId?: string;
  tempekId?: string;
  jenisMipilId?: string;
  q?: string;
  /** Satu status, banyak status, atau kosong = semua. */
  statusBayar?: LaporanPaturunanStatusFilter | LaporanPaturunanStatusFilter[];
};

export type LaporanPaturunanRingkasan = RingkasanIuran & {
  jumlah_lunas: number;
  jumlah_belum: number;
  jumlah_cicil: number;
};

function normalizeStatusFilters(
  status?: LaporanPaturunanFilter["statusBayar"]
): LaporanPaturunanStatusFilter[] {
  if (!status) return [];
  return Array.isArray(status) ? status.filter(Boolean) : [status];
}

function filterByStatus(
  rows: PaturunanKramaRow[],
  status?: LaporanPaturunanFilter["statusBayar"]
): PaturunanKramaRow[] {
  const selected = normalizeStatusFilters(status);
  if (selected.length === 0) return rows;

  return rows.filter((r) => {
    const tagihan = r.tagihan ?? 0;
    const dibayar = r.dibayar ?? 0;
    const punia = r.punia ?? 0;
    const statusRow = statusBayarPaturunan(tagihan, dibayar, punia);
    return selected.some((s) => (s === "telat" ? r.peringatan_telat : statusRow === s));
  });
}

function hitungRingkasanDariRows(
  base: RingkasanIuran,
  rows: PaturunanKramaRow[]
): LaporanPaturunanRingkasan {
  let jumlah_lunas = 0;
  let jumlah_belum = 0;
  let jumlah_cicil = 0;

  for (const r of rows) {
    const tagihan = r.tagihan ?? 0;
    const dibayar = r.dibayar ?? 0;
    const punia = r.punia ?? 0;
    const status = statusBayarPaturunan(tagihan, dibayar, punia);
    if (status === "lunas" || status === "lunas_punia") jumlah_lunas += 1;
    else if (status === "belum" || status === "punia") jumlah_belum += 1;
    else if (status === "cicil" || status === "cicil_punia") jumlah_cicil += 1;
  }

  return {
    ...base,
    total_krama: rows.length,
    total_tagihan: rows.reduce((s, r) => s + (r.tagihan ?? 0), 0),
    total_dibayar_wajib: rows.reduce((s, r) => s + (r.dibayar ?? 0), 0),
    total_punia: rows.reduce((s, r) => s + (r.punia ?? 0), 0),
    total_sisa: rows.reduce((s, r) => s + (r.sisa ?? 0), 0),
    jumlah_belum_lunas_telat: rows.filter((r) => r.peringatan_telat).length,
    jumlah_lunas,
    jumlah_belum,
    jumlah_cicil,
  };
}

export async function getLaporanPaturunan(filter: LaporanPaturunanFilter): Promise<{
  ringkasan: LaporanPaturunanRingkasan | null;
  rows: PaturunanKramaRow[];
}> {
  const base = await getRingkasanIuran(filter.iuranId);
  if (!base) return { ringkasan: null, rows: [] };

  const all = await listKramaPaturunan({
    iuranId: filter.iuranId,
    banjarId: filter.banjarId,
    tempekId: filter.tempekId,
    jenisMipilId: filter.jenisMipilId,
    q: filter.q,
  });
  const rows = filterByStatus(all, filter.statusBayar);
  const ringkasan = hitungRingkasanDariRows(base, rows);

  return { ringkasan, rows };
}
