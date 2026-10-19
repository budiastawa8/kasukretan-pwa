import { getDb } from "../db/client";

export type PosisiUangBucket = {
  wajib: number;
  punia: number;
  jumlah: number;
  transaksi: number;
};

export type PosisiUangPetugasRow = {
  petugas_id: string | null;
  petugas_nama: string;
  jumlah_transaksi: number;
  wajib: number;
  punia: number;
  total: number;
  /** Tanggal bayar paling lama yang belum disetor. */
  tanggal_tertua: string;
};

export type LaporanPosisiUangPaturunan = {
  total: PosisiUangBucket;
  di_petugas: PosisiUangBucket;
  di_bendahara: PosisiUangBucket;
  /** total.jumlah − di_petugas.jumlah − di_bendahara.jumlah (harusnya 0). */
  selisih: number;
  petugas_rows: PosisiUangPetugasRow[];
};

const emptyBucket = (): PosisiUangBucket => ({
  wajib: 0,
  punia: 0,
  jumlah: 0,
  transaksi: 0,
});

function roundRp(n: unknown): number {
  return Math.round(Number(n) || 0);
}

function bucketFrom(row: {
  wajib?: unknown;
  punia?: unknown;
  jumlah?: unknown;
  transaksi?: unknown;
} | undefined): PosisiUangBucket {
  if (!row) return emptyBucket();
  return {
    wajib: roundRp(row.wajib),
    punia: roundRp(row.punia),
    jumlah: roundRp(row.jumlah),
    transaksi: Math.round(Number(row.transaksi) || 0),
  };
}

/**
 * Rekonsiliasi aliran penerimaan paturunan:
 * Total dibayar krama = di tangan petugas + sudah di bendahara (sudah disetor).
 * Filter berdasarkan tanggal bayar; hanya Krama Mipil.
 */
export async function getLaporanPosisiUangPaturunan(params: {
  dari?: string;
  sampai?: string;
}): Promise<LaporanPosisiUangPaturunan> {
  const db = await getDb();
  const args: unknown[] = [];
  let n = 1;
  let where = `p.jumlah > 0`;
  if (params.dari?.trim()) {
    where += ` AND p.tanggal >= $${n++}`;
    args.push(params.dari.trim());
  }
  if (params.sampai?.trim()) {
    where += ` AND p.tanggal <= $${n++}`;
    args.push(params.sampai.trim());
  }

  const fromJoin = `
    FROM paturunan_pembayaran p
    JOIN krama k ON k.id = p.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
    WHERE ${where}
  `;

  const wajibExpr = `COALESCE(SUM(CASE WHEN COALESCE(p.jenis, 'wajib') = 'wajib' THEN p.jumlah ELSE 0 END), 0)`;
  const puniaExpr = `COALESCE(SUM(CASE WHEN COALESCE(p.jenis, 'wajib') = 'punia' THEN p.jumlah ELSE 0 END), 0)`;

  const ringkasan = await db.select<
    {
      total_wajib: number;
      total_punia: number;
      total_jumlah: number;
      total_trx: number;
      petugas_wajib: number;
      petugas_punia: number;
      petugas_jumlah: number;
      petugas_trx: number;
      bendahara_wajib: number;
      bendahara_punia: number;
      bendahara_jumlah: number;
      bendahara_trx: number;
    }[]
  >(
    `SELECT
       ${wajibExpr} as total_wajib,
       ${puniaExpr} as total_punia,
       COALESCE(SUM(p.jumlah), 0) as total_jumlah,
       COUNT(*) as total_trx,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NULL AND COALESCE(p.jenis, 'wajib') = 'wajib' THEN p.jumlah ELSE 0 END), 0) as petugas_wajib,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NULL AND COALESCE(p.jenis, 'wajib') = 'punia' THEN p.jumlah ELSE 0 END), 0) as petugas_punia,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NULL THEN p.jumlah ELSE 0 END), 0) as petugas_jumlah,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NULL THEN 1 ELSE 0 END), 0) as petugas_trx,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NOT NULL AND COALESCE(p.jenis, 'wajib') = 'wajib' THEN p.jumlah ELSE 0 END), 0) as bendahara_wajib,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NOT NULL AND COALESCE(p.jenis, 'wajib') = 'punia' THEN p.jumlah ELSE 0 END), 0) as bendahara_punia,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NOT NULL THEN p.jumlah ELSE 0 END), 0) as bendahara_jumlah,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NOT NULL THEN 1 ELSE 0 END), 0) as bendahara_trx
     ${fromJoin}`,
    args
  );

  const r = ringkasan[0];
  const total = bucketFrom({
    wajib: r?.total_wajib,
    punia: r?.total_punia,
    jumlah: r?.total_jumlah,
    transaksi: r?.total_trx,
  });
  const di_petugas = bucketFrom({
    wajib: r?.petugas_wajib,
    punia: r?.petugas_punia,
    jumlah: r?.petugas_jumlah,
    transaksi: r?.petugas_trx,
  });
  const di_bendahara = bucketFrom({
    wajib: r?.bendahara_wajib,
    punia: r?.bendahara_punia,
    jumlah: r?.bendahara_jumlah,
    transaksi: r?.bendahara_trx,
  });

  const petugasFlat = await db.select<
    {
      petugas_id: string | null;
      petugas_nama: string;
      jumlah_transaksi: number;
      wajib: number;
      punia: number;
      total: number;
      tanggal_tertua: string;
    }[]
  >(
    `SELECT p.petugas_id,
            COALESCE(t.nama, 'Tanpa petugas') as petugas_nama,
            COUNT(*) as jumlah_transaksi,
            ${wajibExpr} as wajib,
            ${puniaExpr} as punia,
            COALESCE(SUM(p.jumlah), 0) as total,
            MIN(p.tanggal) as tanggal_tertua
     FROM paturunan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE ${where} AND p.tanggal_setor IS NULL
     GROUP BY p.petugas_id
     ORDER BY tanggal_tertua ASC, petugas_nama ASC`,
    args
  );

  const petugas_rows: PosisiUangPetugasRow[] = petugasFlat.map((row) => ({
    petugas_id: row.petugas_id,
    petugas_nama: row.petugas_nama,
    jumlah_transaksi: Math.round(Number(row.jumlah_transaksi) || 0),
    wajib: roundRp(row.wajib),
    punia: roundRp(row.punia),
    total: roundRp(row.total),
    tanggal_tertua: row.tanggal_tertua,
  }));

  return {
    total,
    di_petugas,
    di_bendahara,
    selisih: total.jumlah - di_petugas.jumlah - di_bendahara.jumlah,
    petugas_rows,
  };
}
