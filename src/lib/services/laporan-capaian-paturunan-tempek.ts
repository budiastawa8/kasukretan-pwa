import { statusBayarPaturunan } from "../paturunan-hitung";
import { compareBanjarRow, compareTempekRow } from "../wilayah-order";
import { getLaporanPaturunan, type LaporanPaturunanFilter } from "./laporan-paturunan";

export type CapaianPaturunanTempekFilter = Pick<LaporanPaturunanFilter, "iuranId" | "banjarId">;

export type CapaianPaturunanTempekRow = {
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  tempek_nama: string;
  tempek_created_at: string | null;
  jumlah_krama: number;
  /** Krama wajib bayar yang sudah lunas (termasuk lunas+punia). */
  jumlah_lunas: number;
  /** Krama wajib bayar yang masih cicil (termasuk cicil+punia). */
  jumlah_cicil: number;
  /** Krama wajib bayar yang belum bayar wajib (termasuk hanya punia). */
  jumlah_belum: number;
  tagihan: number;
  dibayar: number;
  sisa: number;
  punia: number;
  pct_dibayar: number | null;
  pct_sisa: number | null;
};

export type CapaianPaturunanTempekRingkasan = {
  jumlah_tempek: number;
  jumlah_krama: number;
  jumlah_lunas: number;
  jumlah_cicil: number;
  jumlah_belum: number;
  total_tagihan: number;
  total_dibayar: number;
  total_sisa: number;
  total_punia: number;
  pct_dibayar: number | null;
  pct_sisa: number | null;
};

function pctOf(nilai: number, tagihan: number): number | null {
  if (tagihan <= 0) return null;
  return (nilai / tagihan) * 100;
}

/** Persentase terhadap tagihan (1 desimal, id-ID). Tagihan 0 → "—". */
export function formatPctTerhadapTagihan(pct: number | null): string {
  if (pct == null) return "—";
  return `${pct.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Format ringkas status bayar per tempek: `12 / 3 / 5`. */
export function formatStatusLunasCicilBelum(
  lunas: number,
  cicil: number,
  belum: number
): string {
  return `${lunas} / ${cicil} / ${belum}`;
}

function bumpStatusCounts(
  agg: Pick<CapaianPaturunanTempekRow, "jumlah_lunas" | "jumlah_cicil" | "jumlah_belum">,
  tagihan: number,
  dibayar: number,
  punia: number
): void {
  const status = statusBayarPaturunan(tagihan, dibayar, punia);
  if (status === "lunas" || status === "lunas_punia") agg.jumlah_lunas += 1;
  else if (status === "cicil" || status === "cicil_punia") agg.jumlah_cicil += 1;
  else if (status === "belum" || status === "punia") agg.jumlah_belum += 1;
  // tidak_wajib: tidak dihitung di ketiga bucket
}

function aggregateRows(
  rows: Awaited<ReturnType<typeof getLaporanPaturunan>>["rows"]
): CapaianPaturunanTempekRow[] {
  const map = new Map<string, CapaianPaturunanTempekRow>();

  for (const r of rows) {
    const tempekNama = r.tempek_nama?.trim() || "—";
    const key = `${r.banjar_id}\0${tempekNama}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        banjar_id: r.banjar_id,
        banjar_nama: r.banjar_nama,
        banjar_kode: r.banjar_kode,
        tempek_nama: tempekNama,
        tempek_created_at: r.tempek_created_at ?? null,
        jumlah_krama: 0,
        jumlah_lunas: 0,
        jumlah_cicil: 0,
        jumlah_belum: 0,
        tagihan: 0,
        dibayar: 0,
        sisa: 0,
        punia: 0,
        pct_dibayar: null,
        pct_sisa: null,
      };
      map.set(key, agg);
    }
    const tagihan = r.tagihan ?? 0;
    const dibayar = r.dibayar ?? 0;
    const punia = r.punia ?? 0;
    agg.jumlah_krama += 1;
    agg.tagihan += tagihan;
    agg.dibayar += dibayar;
    agg.sisa += r.sisa ?? 0;
    agg.punia += punia;
    bumpStatusCounts(agg, tagihan, dibayar, punia);
  }

  const list = [...map.values()].sort((a, b) => {
    const byBanjar = compareBanjarRow(a, b);
    if (byBanjar !== 0) return byBanjar;
    return compareTempekRow(a, b);
  });

  for (const row of list) {
    row.pct_dibayar = pctOf(row.dibayar, row.tagihan);
    row.pct_sisa = pctOf(row.sisa, row.tagihan);
  }

  return list;
}

function hitungRingkasan(rows: CapaianPaturunanTempekRow[]): CapaianPaturunanTempekRingkasan {
  const total_tagihan = rows.reduce((s, r) => s + r.tagihan, 0);
  const total_dibayar = rows.reduce((s, r) => s + r.dibayar, 0);
  const total_sisa = rows.reduce((s, r) => s + r.sisa, 0);
  const total_punia = rows.reduce((s, r) => s + r.punia, 0);
  return {
    jumlah_tempek: rows.length,
    jumlah_krama: rows.reduce((s, r) => s + r.jumlah_krama, 0),
    jumlah_lunas: rows.reduce((s, r) => s + r.jumlah_lunas, 0),
    jumlah_cicil: rows.reduce((s, r) => s + r.jumlah_cicil, 0),
    jumlah_belum: rows.reduce((s, r) => s + r.jumlah_belum, 0),
    total_tagihan,
    total_dibayar,
    total_sisa,
    total_punia,
    pct_dibayar: pctOf(total_dibayar, total_tagihan),
    pct_sisa: pctOf(total_sisa, total_tagihan),
  };
}

export async function getLaporanCapaianPaturunanTempek(
  filter: CapaianPaturunanTempekFilter
): Promise<{
  ringkasan: CapaianPaturunanTempekRingkasan | null;
  rows: CapaianPaturunanTempekRow[];
}> {
  const { ringkasan: base, rows: kramaRows } = await getLaporanPaturunan({
    iuranId: filter.iuranId,
    banjarId: filter.banjarId,
    includeNonaktifDenganPembayaran: true,
  });
  if (!base) return { ringkasan: null, rows: [] };

  const rows = aggregateRows(kramaRows);
  return { ringkasan: hitungRingkasan(rows), rows };
}
