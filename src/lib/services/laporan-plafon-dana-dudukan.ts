import {
  getPlafonAlokasiDudukanDefaultAkun,
  isPlafonTimBantuanAktif,
  labelPlafonPool,
  listPengeluaranDanaDudukanPerPosDefaultAkun,
  normalizePlafonPool,
  type PengeluaranDanaDudukanPerPosRow,
  type PlafonPool,
} from "./kas-dudukan-alokasi";
import type { PlafonAlokasiDudukanRow } from "../types";

export type { PengeluaranDanaDudukanPerPosRow, PlafonPool };
export { isPlafonTimBantuanAktif, labelPlafonPool, normalizePlafonPool };

export type LaporanPlafonDanaDudukanRow = PlafonAlokasiDudukanRow & {
  /** Persentase pencapaian (terpakai / plafon × 100), null jika plafon 0. */
  pencapaian_pct: number | null;
};

export type LaporanPlafonDanaDudukan = {
  tahun: number;
  pool: PlafonPool;
  total_penerimaan: number;
  total_penerimaan_dudukan: number;
  total_penerimaan_dana_lain: number;
  total_terpakai: number;
  total_sisa: number;
  rows: LaporanPlafonDanaDudukanRow[];
};

function withPencapaian(row: PlafonAlokasiDudukanRow): LaporanPlafonDanaDudukanRow {
  const pencapaian_pct =
    row.plafon > 0 ? Math.round((row.terpakai / row.plafon) * 1000) / 10 : null;
  return { ...row, pencapaian_pct };
}

export async function getLaporanPlafonDanaDudukan(
  tahun: number,
  pool: PlafonPool = "utama"
): Promise<LaporanPlafonDanaDudukan> {
  const data = await getPlafonAlokasiDudukanDefaultAkun(tahun, undefined, pool);
  const rows = data.rows.map(withPencapaian);
  const total_terpakai = rows.reduce((s, r) => s + r.terpakai, 0);
  const total_sisa = rows.reduce((s, r) => s + r.sisa, 0);
  return {
    tahun: data.tahun,
    pool: data.pool,
    total_penerimaan: data.total_penerimaan,
    total_penerimaan_dudukan: data.total_penerimaan_dudukan,
    total_penerimaan_dana_lain: data.total_penerimaan_dana_lain,
    total_terpakai,
    total_sisa,
    rows,
  };
}

export async function getLaporanPlafonDanaDudukanSemuaPool(tahun: number): Promise<{
  timBantuanAktif: boolean;
  utama: LaporanPlafonDanaDudukan;
  bantuan: LaporanPlafonDanaDudukan | null;
}> {
  const timBantuanAktif = await isPlafonTimBantuanAktif();
  const utama = await getLaporanPlafonDanaDudukan(tahun, "utama");
  const bantuan = timBantuanAktif
    ? await getLaporanPlafonDanaDudukan(tahun, "bantuan")
    : null;
  return { timBantuanAktif, utama, bantuan };
}

export async function listTransaksiPlafonDanaDudukanPerPos(
  tahun: number,
  posBiayaId: string,
  pool: PlafonPool = "utama"
): Promise<PengeluaranDanaDudukanPerPosRow[]> {
  return listPengeluaranDanaDudukanPerPosDefaultAkun(tahun, posBiayaId, pool);
}

/** Semua transaksi pengeluaran tahun ini, dikelompokkan per pos biaya alokasi. */
export async function listAllTransaksiPlafonDanaDudukanGrouped(
  tahun: number,
  pool: PlafonPool = "utama"
): Promise<Map<string, PengeluaranDanaDudukanPerPosRow[]>> {
  const all = await listPengeluaranDanaDudukanPerPosDefaultAkun(tahun, undefined, pool);
  const map = new Map<string, PengeluaranDanaDudukanPerPosRow[]>();
  for (const tx of all) {
    const list = map.get(tx.pos_biaya_id) ?? [];
    list.push(tx);
    map.set(tx.pos_biaya_id, list);
  }
  return map;
}

export function formatPencapaianPlafon(pct: number | null): string {
  if (pct == null) return "—";
  return `${pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}
