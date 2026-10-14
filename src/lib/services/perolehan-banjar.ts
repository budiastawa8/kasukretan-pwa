import { getDb } from "../db/client";
import type { ModePungut } from "./pungut";

export type PerolehanRincian = {
  kunci: string;
  label: string;
  jumlah: number;
  transaksi: number;
  krama: number;
  wajib?: number;
  punia?: number;
};

export type PerolehanBanjar = {
  total: number;
  transaksi: number;
  krama: number;
  wajib?: number;
  punia?: number;
  rincianJudul: string;
  rincian: PerolehanRincian[];
};

type AggRow = {
  kunci: string;
  label: string;
  jumlah: number;
  transaksi: number;
  krama: number;
  wajib?: number;
  punia?: number;
};

const roundRp = (n: unknown) => Math.round(Number(n) || 0);

/** Perolehan dihitung dari tanggal bayar (sama dengan laporan rekap penerimaan), termasuk yang belum disetor. */
export async function getPerolehanBanjar(params: {
  mode: ModePungut;
  banjarId: string | null;
  dari: string;
  sampai: string;
}): Promise<PerolehanBanjar> {
  const db = await getDb();
  const perBanjar = !params.banjarId;
  const args: unknown[] = [params.dari, params.sampai];
  let where = `p.tanggal >= $1 AND p.tanggal <= $2`;
  if (params.banjarId) {
    where += ` AND k.banjar_id = $3`;
    args.push(params.banjarId);
  }

  const isPaturunan = params.mode === "paturunan";
  const from = isPaturunan
    ? `FROM paturunan_pembayaran p
       JOIN krama k ON k.id = p.krama_id
       JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
       JOIN banjar b ON b.id = k.banjar_id
       JOIN iuran_paturunan i ON i.id = p.iuran_id`
    : `FROM dudukan_pembayaran p
       JOIN krama k ON k.id = p.krama_id
       JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
         AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
       JOIN banjar b ON b.id = k.banjar_id`;
  const wajibPunia = isPaturunan
    ? `, COALESCE(SUM(CASE WHEN COALESCE(p.jenis, 'wajib') = 'wajib' THEN p.jumlah ELSE 0 END), 0) as wajib,
         COALESCE(SUM(CASE WHEN COALESCE(p.jenis, 'wajib') = 'punia' THEN p.jumlah ELSE 0 END), 0) as punia`
    : "";
  const agg = `COALESCE(SUM(p.jumlah), 0) as jumlah,
               COUNT(*) as transaksi,
               COUNT(DISTINCT p.krama_id) as krama${wajibPunia}`;

  let groupSelect: string;
  let groupBy: string;
  let orderBy: string;
  let rincianJudul: string;
  if (perBanjar) {
    groupSelect = `b.id as kunci, b.nama as label`;
    groupBy = `b.id, b.nama, b.kode`;
    orderBy = `b.kode ASC`;
    rincianJudul = "Per banjar";
  } else if (isPaturunan) {
    groupSelect = `i.id as kunci, i.nama as label`;
    groupBy = `i.id, i.nama, i.created_at`;
    orderBy = `i.created_at ASC`;
    rincianJudul = "Per iuran";
  } else {
    groupSelect = `kk.kode as kunci, kk.nama_tampilan as label`;
    groupBy = `kk.kode, kk.nama_tampilan`;
    orderBy = `kk.kode ASC`;
    rincianJudul = "Per klasifikasi";
  }

  const [totalRows, rincianRows] = await Promise.all([
    db.select<AggRow[]>(`SELECT ${agg} ${from} WHERE ${where}`, args),
    db.select<AggRow[]>(
      `SELECT ${groupSelect}, ${agg} ${from} WHERE ${where}
       GROUP BY ${groupBy}
       HAVING COALESCE(SUM(p.jumlah), 0) > 0
       ORDER BY ${orderBy}`,
      args
    ),
  ]);

  const t = totalRows[0];
  return {
    total: roundRp(t?.jumlah),
    transaksi: roundRp(t?.transaksi),
    krama: roundRp(t?.krama),
    ...(isPaturunan ? { wajib: roundRp(t?.wajib), punia: roundRp(t?.punia) } : {}),
    rincianJudul,
    rincian: rincianRows.map((r) => ({
      kunci: r.kunci,
      label: r.label,
      jumlah: roundRp(r.jumlah),
      transaksi: roundRp(r.transaksi),
      krama: roundRp(r.krama),
      ...(isPaturunan ? { wajib: roundRp(r.wajib), punia: roundRp(r.punia) } : {}),
    })),
  };
}
