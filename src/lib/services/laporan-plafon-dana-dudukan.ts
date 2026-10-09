import {
  getPlafonAlokasiDudukanDefaultAkun,
  listPengeluaranDanaDudukanPerPosDefaultAkun,
  type PengeluaranDanaDudukanPerPosRow,
} from "./kas-dudukan-alokasi";
import type { PlafonAlokasiDudukanRow } from "../types";

export type { PengeluaranDanaDudukanPerPosRow };

export type LaporanPlafonDanaDudukanRow = PlafonAlokasiDudukanRow & {
  /** Persentase pencapaian (terpakai / plafon × 100), null jika plafon 0. */
  pencapaian_pct: number | null;
};

export type LaporanPlafonDanaDudukan = {
  tahun: number;
  total_penerimaan: number;
  total_terpakai: number;
  total_sisa: number;
  rows: LaporanPlafonDanaDudukanRow[];
};

function withPencapaian(row: PlafonAlokasiDudukanRow): LaporanPlafonDanaDudukanRow {
  const pencapaian_pct =
    row.plafon > 0 ? Math.round((row.terpakai / row.plafon) * 1000) / 10 : null;
  return { ...row, pencapaian_pct };
}

export async function getLaporanPlafonDanaDudukan(tahun: number): Promise<LaporanPlafonDanaDudukan> {
  const data = await getPlafonAlokasiDudukanDefaultAkun(tahun);
  const rows = data.rows.map(withPencapaian);
  const total_terpakai = rows.reduce((s, r) => s + r.terpakai, 0);
  const total_sisa = rows.reduce((s, r) => s + r.sisa, 0);
  return {
    tahun: data.tahun,
    total_penerimaan: data.total_penerimaan,
    total_terpakai,
    total_sisa,
    rows,
  };
}

export async function listTransaksiPlafonDanaDudukanPerPos(
  tahun: number,
  posBiayaId: string
): Promise<PengeluaranDanaDudukanPerPosRow[]> {
  return listPengeluaranDanaDudukanPerPosDefaultAkun(tahun, posBiayaId);
}

/** Semua transaksi pengeluaran tahun ini, dikelompokkan per pos biaya alokasi. */
export async function listAllTransaksiPlafonDanaDudukanGrouped(
  tahun: number
): Promise<Map<string, PengeluaranDanaDudukanPerPosRow[]>> {
  const all = await listPengeluaranDanaDudukanPerPosDefaultAkun(tahun);
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
