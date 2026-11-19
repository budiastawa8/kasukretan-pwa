import { getDb } from "../db/client";
import { compareBanjarRow, compareTempekRow } from "../wilayah-order";
import { getIuranPaturunan } from "./iuran-paturunan";
import type { LaporanPaturunanFilter } from "./laporan-paturunan";
import { sqlTagihanPaturunan } from "./paturunan";

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

type AggSqlRow = {
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  tempek_nama: string;
  tempek_created_at: string | null;
  jumlah_krama: number;
  jumlah_lunas: number;
  jumlah_cicil: number;
  jumlah_belum: number;
  tagihan: number;
  dibayar: number;
  sisa: number;
  punia: number;
};

/**
 * Satu query agregat per tempek — menghindari:
 * - getRingkasanIuran (scan ganda)
 * - listKramaPaturunan tanpa LIMIT (tarik semua detail krama)
 * - getPembayaranTotalsMap dengan IN (...semua id)
 */
async function loadCapaianAggRows(params: {
  iuranId: string;
  banjarId?: string;
  nominal: number;
  tanggalTarget: string | null;
}): Promise<CapaianPaturunanTempekRow[]> {
  const db = await getDb();
  const tagihanExpr = sqlTagihanPaturunan("$1", "$2");
  const args: unknown[] = [params.nominal, params.tanggalTarget, params.iuranId];
  let banjarClause = "";
  if (params.banjarId?.trim()) {
    banjarClause = ` AND k.banjar_id = $${args.length + 1}`;
    args.push(params.banjarId.trim());
  }

  const sql = `
    SELECT
      fin.banjar_id,
      fin.banjar_nama,
      fin.banjar_kode,
      fin.tempek_nama,
      MIN(fin.tempek_created_at) AS tempek_created_at,
      COUNT(*) AS jumlah_krama,
      COALESCE(SUM(CASE
        WHEN fin.tagihan > 0 AND fin.dibayar >= fin.tagihan THEN 1 ELSE 0
      END), 0) AS jumlah_lunas,
      COALESCE(SUM(CASE
        WHEN fin.tagihan > 0 AND fin.dibayar > 0 AND fin.dibayar < fin.tagihan THEN 1 ELSE 0
      END), 0) AS jumlah_cicil,
      COALESCE(SUM(CASE
        WHEN fin.tagihan > 0 AND fin.dibayar <= 0 THEN 1 ELSE 0
      END), 0) AS jumlah_belum,
      COALESCE(SUM(fin.tagihan), 0) AS tagihan,
      COALESCE(SUM(fin.dibayar), 0) AS dibayar,
      COALESCE(SUM(CASE
        WHEN fin.tagihan > fin.dibayar THEN fin.tagihan - fin.dibayar ELSE 0
      END), 0) AS sisa,
      COALESCE(SUM(fin.punia), 0) AS punia
    FROM (
      SELECT
        k.banjar_id AS banjar_id,
        b.nama AS banjar_nama,
        b.kode AS banjar_kode,
        COALESCE(NULLIF(TRIM(tp.nama), ''), '—') AS tempek_nama,
        tp.created_at AS tempek_created_at,
        (${tagihanExpr}) AS tagihan,
        COALESCE(pay.wajib, 0) AS dibayar,
        COALESCE(pay.punia, 0) AS punia
      FROM krama k
      JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
      JOIN banjar b ON b.id = k.banjar_id
      LEFT JOIN tempek tp ON tp.id = k.tempek_id
      LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
      LEFT JOIN jenis_krama_mipil jprev ON jprev.id = k.jenis_sebelum_nyada_id
      LEFT JOIN desa_adat d ON d.id = k.desa_adat_id
      LEFT JOIN jenis_krama_mipil jny ON jny.id = d.jenis_krama_mipil_id
      LEFT JOIN (
        SELECT krama_id,
               COALESCE(SUM(CASE WHEN COALESCE(jenis, 'wajib') = 'punia' THEN 0 ELSE jumlah END), 0) AS wajib,
               COALESCE(SUM(CASE WHEN COALESCE(jenis, 'wajib') = 'punia' THEN jumlah ELSE 0 END), 0) AS punia
        FROM paturunan_pembayaran
        WHERE iuran_id = $3
        GROUP BY krama_id
      ) pay ON pay.krama_id = k.id
      WHERE kk.kode = 'MIPIL'
        AND (
          k.status_krama = 'aktif'
          OR (k.status_krama = 'nonaktif' AND pay.krama_id IS NOT NULL)
        )
        ${banjarClause}
    ) fin
    GROUP BY fin.banjar_id, fin.banjar_nama, fin.banjar_kode, fin.tempek_nama
  `;

  const raw = await db.select<AggSqlRow[]>(sql, args);
  const rows: CapaianPaturunanTempekRow[] = raw.map((r) => {
    const tagihan = Math.round(Number(r.tagihan) || 0);
    const dibayar = Math.round(Number(r.dibayar) || 0);
    const sisa = Math.round(Number(r.sisa) || 0);
    const punia = Math.round(Number(r.punia) || 0);
    return {
      banjar_id: String(r.banjar_id ?? ""),
      banjar_nama: String(r.banjar_nama ?? ""),
      banjar_kode: String(r.banjar_kode ?? ""),
      tempek_nama: String(r.tempek_nama ?? "—"),
      tempek_created_at: r.tempek_created_at ? String(r.tempek_created_at) : null,
      jumlah_krama: Math.round(Number(r.jumlah_krama) || 0),
      jumlah_lunas: Math.round(Number(r.jumlah_lunas) || 0),
      jumlah_cicil: Math.round(Number(r.jumlah_cicil) || 0),
      jumlah_belum: Math.round(Number(r.jumlah_belum) || 0),
      tagihan,
      dibayar,
      sisa,
      punia,
      pct_dibayar: pctOf(dibayar, tagihan),
      pct_sisa: pctOf(sisa, tagihan),
    };
  });

  rows.sort((a, b) => {
    const byBanjar = compareBanjarRow(a, b);
    if (byBanjar !== 0) return byBanjar;
    return compareTempekRow(a, b);
  });
  return rows;
}

export async function getLaporanCapaianPaturunanTempek(
  filter: CapaianPaturunanTempekFilter
): Promise<{
  ringkasan: CapaianPaturunanTempekRingkasan | null;
  rows: CapaianPaturunanTempekRow[];
}> {
  const iuran = await getIuranPaturunan(filter.iuranId);
  if (!iuran) return { ringkasan: null, rows: [] };

  const rows = await loadCapaianAggRows({
    iuranId: filter.iuranId,
    banjarId: filter.banjarId,
    nominal: Number(iuran.nominal) || 0,
    tanggalTarget: iuran.tanggal_target?.trim() || null,
  });

  return { ringkasan: hitungRingkasan(rows), rows };
}
