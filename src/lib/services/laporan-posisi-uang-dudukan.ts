import { getDb } from "../db/client";

export type PosisiUangDudukanBucket = {
  jumlah: number;
  transaksi: number;
};

export type PosisiUangDudukanPetugasRow = {
  petugas_id: string | null;
  petugas_nama: string;
  jumlah_transaksi: number;
  total: number;
  /** Tanggal bayar paling lama yang belum disetor. */
  tanggal_tertua: string;
};

export type LaporanPosisiUangDudukan = {
  total: PosisiUangDudukanBucket;
  di_petugas: PosisiUangDudukanBucket;
  di_bendahara: PosisiUangDudukanBucket;
  /** total.jumlah − di_petugas.jumlah − di_bendahara.jumlah (harusnya 0). */
  selisih: number;
  petugas_rows: PosisiUangDudukanPetugasRow[];
};

const emptyBucket = (): PosisiUangDudukanBucket => ({
  jumlah: 0,
  transaksi: 0,
});

function roundRp(n: unknown): number {
  return Math.round(Number(n) || 0);
}

function bucketFrom(row: {
  jumlah?: unknown;
  transaksi?: unknown;
} | undefined): PosisiUangDudukanBucket {
  if (!row) return emptyBucket();
  return {
    jumlah: roundRp(row.jumlah),
    transaksi: Math.round(Number(row.transaksi) || 0),
  };
}

/**
 * Rekonsiliasi aliran penerimaan dudukan:
 * Total dibayar pemasih = di tangan petugas + sudah di bendahara (sudah disetor).
 * Filter berdasarkan tanggal bayar; hanya Krama Tamiu & Tamiu.
 */
export async function getLaporanPosisiUangDudukan(params: {
  dari?: string;
  sampai?: string;
}): Promise<LaporanPosisiUangDudukan> {
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
    FROM dudukan_pembayaran p
    JOIN krama k ON k.id = p.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
      AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
    WHERE ${where}
  `;

  const ringkasan = await db.select<
    {
      total_jumlah: number;
      total_trx: number;
      petugas_jumlah: number;
      petugas_trx: number;
      bendahara_jumlah: number;
      bendahara_trx: number;
    }[]
  >(
    `SELECT
       COALESCE(SUM(p.jumlah), 0) as total_jumlah,
       COUNT(*) as total_trx,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NULL THEN p.jumlah ELSE 0 END), 0) as petugas_jumlah,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NULL THEN 1 ELSE 0 END), 0) as petugas_trx,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NOT NULL THEN p.jumlah ELSE 0 END), 0) as bendahara_jumlah,
       COALESCE(SUM(CASE WHEN p.tanggal_setor IS NOT NULL THEN 1 ELSE 0 END), 0) as bendahara_trx
     ${fromJoin}`,
    args
  );

  const r = ringkasan[0];
  const total = bucketFrom({
    jumlah: r?.total_jumlah,
    transaksi: r?.total_trx,
  });
  const di_petugas = bucketFrom({
    jumlah: r?.petugas_jumlah,
    transaksi: r?.petugas_trx,
  });
  const di_bendahara = bucketFrom({
    jumlah: r?.bendahara_jumlah,
    transaksi: r?.bendahara_trx,
  });

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
     FROM dudukan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE ${where} AND p.tanggal_setor IS NULL
     GROUP BY p.petugas_id
     ORDER BY tanggal_tertua ASC, petugas_nama ASC`,
    args
  );

  const petugas_rows: PosisiUangDudukanPetugasRow[] = petugasFlat.map((row) => ({
    petugas_id: row.petugas_id,
    petugas_nama: row.petugas_nama,
    jumlah_transaksi: Math.round(Number(row.jumlah_transaksi) || 0),
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
