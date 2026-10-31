import { getDb } from "../db/client";

export type PosisiUangDanaLainBucket = {
  jumlah: number;
  transaksi: number;
};

export type PosisiUangDanaLainPetugasRow = {
  petugas_id: string | null;
  petugas_nama: string;
  jumlah_transaksi: number;
  total: number;
  tanggal_tertua: string;
};

export type LaporanPosisiUangDanaLain = {
  total: PosisiUangDanaLainBucket;
  di_petugas: PosisiUangDanaLainBucket;
  di_bendahara: PosisiUangDanaLainBucket;
  punia: PosisiUangDanaLainBucket;
  kerjasama: PosisiUangDanaLainBucket;
  /** total.jumlah − di_petugas − di_bendahara (harusnya 0). */
  selisih: number;
  petugas_rows: PosisiUangDanaLainPetugasRow[];
};

const emptyBucket = (): PosisiUangDanaLainBucket => ({ jumlah: 0, transaksi: 0 });

function roundRp(n: unknown): number {
  return Math.round(Number(n) || 0);
}

function bucketFrom(row: { jumlah?: unknown; transaksi?: unknown } | undefined): PosisiUangDanaLainBucket {
  if (!row) return emptyBucket();
  return {
    jumlah: roundRp(row.jumlah),
    transaksi: Math.round(Number(row.transaksi) || 0),
  };
}

/**
 * Rekonsiliasi Punia Kasukretan & Dana Kerjasama:
 * Total diterima = di tangan petugas + sudah di bendahara (sudah disetor).
 */
export async function getLaporanPosisiUangDanaLain(params: {
  dari?: string;
  sampai?: string;
}): Promise<LaporanPosisiUangDanaLain> {
  const db = await getDb();
  const args: unknown[] = [];
  let where = `p.jumlah > 0`;
  if (params.dari?.trim()) {
    where += ` AND p.tanggal >= ?`;
    args.push(params.dari.trim());
  }
  if (params.sampai?.trim()) {
    where += ` AND p.tanggal <= ?`;
    args.push(params.sampai.trim());
  }

  const ringkasan = await db.select<
    {
      total_jumlah: number;
      total_trx: number;
      petugas_jumlah: number;
      petugas_trx: number;
      bendahara_jumlah: number;
      bendahara_trx: number;
      punia_jumlah: number;
      punia_trx: number;
      kerjasama_jumlah: number;
      kerjasama_trx: number;
    }[]
  >(
    `SELECT
       COALESCE(SUM(p.jumlah), 0) as total_jumlah,
       COUNT(*) as total_trx,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NULL THEN p.jumlah ELSE 0 END), 0) as petugas_jumlah,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NULL THEN 1 ELSE 0 END), 0) as petugas_trx,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NOT NULL THEN p.jumlah ELSE 0 END), 0) as bendahara_jumlah,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NOT NULL THEN 1 ELSE 0 END), 0) as bendahara_trx,
       COALESCE(SUM(CASE WHEN p.jenis = 'punia_kasukretan' THEN p.jumlah ELSE 0 END), 0) as punia_jumlah,
       COALESCE(SUM(CASE WHEN p.jenis = 'punia_kasukretan' THEN 1 ELSE 0 END), 0) as punia_trx,
       COALESCE(SUM(CASE WHEN p.jenis = 'dana_kerjasama' THEN p.jumlah ELSE 0 END), 0) as kerjasama_jumlah,
       COALESCE(SUM(CASE WHEN p.jenis = 'dana_kerjasama' THEN 1 ELSE 0 END), 0) as kerjasama_trx
     FROM penerimaan_dana_lain p
     WHERE ${where}`,
    args
  );

  const r = ringkasan[0];
  const total = bucketFrom({ jumlah: r?.total_jumlah, transaksi: r?.total_trx });
  const di_petugas = bucketFrom({ jumlah: r?.petugas_jumlah, transaksi: r?.petugas_trx });
  const di_bendahara = bucketFrom({ jumlah: r?.bendahara_jumlah, transaksi: r?.bendahara_trx });
  const punia = bucketFrom({ jumlah: r?.punia_jumlah, transaksi: r?.punia_trx });
  const kerjasama = bucketFrom({ jumlah: r?.kerjasama_jumlah, transaksi: r?.kerjasama_trx });

  const petugasFlat = await db.select<
    {
      petugas_id: string | null;
      petugas_nama: string;
      jumlah_transaksi: number;
      total: number;
      tanggal_tertua: string;
    }[]
  >(
    `SELECT p.petugas_id,
            COALESCE(t.nama, 'Tanpa petugas') as petugas_nama,
            COUNT(*) as jumlah_transaksi,
            COALESCE(SUM(p.jumlah), 0) as total,
            MIN(p.tanggal) as tanggal_tertua
     FROM penerimaan_dana_lain p
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE ${where} AND p.tanggal_setor IS NULL
     GROUP BY p.petugas_id
     ORDER BY tanggal_tertua ASC, petugas_nama ASC`,
    args
  );

  return {
    total,
    di_petugas,
    di_bendahara,
    punia,
    kerjasama,
    selisih: total.jumlah - di_petugas.jumlah - di_bendahara.jumlah,
    petugas_rows: petugasFlat.map((row) => ({
      petugas_id: row.petugas_id,
      petugas_nama: row.petugas_nama,
      jumlah_transaksi: Math.round(Number(row.jumlah_transaksi) || 0),
      total: roundRp(row.total),
      tanggal_tertua: row.tanggal_tertua,
    })),
  };
}
