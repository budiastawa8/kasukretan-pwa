import { getDb } from "../db/client";
import { cachedQuery } from "../query-cache";
import { readRingkasanCache, writeRingkasanCache } from "./ringkasan-cache";

export type LaporanEksekutifJenisKrama = {
  jenis_id: string;
  jenis_nama: string;
  jumlah_krama: number;
};

export type LaporanEksekutifDemografi = {
  total_krama: number;
  mipil: number;
  krama_tamiu: number;
  tamiu: number;
  /** Krama Tamiu + Tamiu */
  pemasih: number;
  per_jenis: {
    mipil: LaporanEksekutifJenisKrama[];
    krama_tamiu: LaporanEksekutifJenisKrama[];
    tamiu: LaporanEksekutifJenisKrama[];
  };
};

type JenisKramaQuery = {
  jenisTable: "jenis_krama_mipil" | "jenis_krama_tamiu" | "jenis_tamiu";
  fkColumn: "jenis_krama_mipil_id" | "jenis_krama_tamiu_id" | "jenis_tamiu_id";
  klasifikasiKode: "MIPIL" | "KRAMA_TAMIU" | "TAMIU";
};

async function getJenisKramaCountsForKlasifikasi(
  db: Awaited<ReturnType<typeof getDb>>,
  { jenisTable, fkColumn, klasifikasiKode }: JenisKramaQuery
): Promise<LaporanEksekutifJenisKrama[]> {
  const rows = await db.select<LaporanEksekutifJenisKrama[]>(
    `SELECT j.id as jenis_id, j.nama as jenis_nama,
            (SELECT COUNT(*) FROM krama k
             INNER JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = $1
             WHERE k.${fkColumn} = j.id AND k.status_krama = 'aktif') as jumlah_krama
     FROM ${jenisTable} j
     WHERE j.aktif = 1
     ORDER BY j.nama ASC`,
    [klasifikasiKode]
  );

  const result = rows.map((r) => ({
    jenis_id: r.jenis_id,
    jenis_nama: r.jenis_nama,
    jumlah_krama: Number(r.jumlah_krama) || 0,
  }));

  const unassigned = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = $1
     WHERE k.status_krama = 'aktif' AND k.${fkColumn} IS NULL`,
    [klasifikasiKode]
  );
  const unassignedCount = unassigned[0]?.c ?? 0;
  if (unassignedCount > 0) {
    result.push({
      jenis_id: "",
      jenis_nama: "Belum diisi",
      jumlah_krama: unassignedCount,
    });
  }

  return result;
}

async function loadDemografiKrama(): Promise<LaporanEksekutifDemografi> {
  const db = await getDb();
  const [mipilRows, kramaTamiuRows, tamiuRows, perKodeRows] = await Promise.all([
    getJenisKramaCountsForKlasifikasi(db, {
      jenisTable: "jenis_krama_mipil",
      fkColumn: "jenis_krama_mipil_id",
      klasifikasiKode: "MIPIL",
    }),
    getJenisKramaCountsForKlasifikasi(db, {
      jenisTable: "jenis_krama_tamiu",
      fkColumn: "jenis_krama_tamiu_id",
      klasifikasiKode: "KRAMA_TAMIU",
    }),
    getJenisKramaCountsForKlasifikasi(db, {
      jenisTable: "jenis_tamiu",
      fkColumn: "jenis_tamiu_id",
      klasifikasiKode: "TAMIU",
    }),
    db.select<{ kode: string; c: number }[]>(
      `SELECT kk.kode, COUNT(*) as c
       FROM krama k
       JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       WHERE k.status_krama = 'aktif'
       GROUP BY kk.kode`
    ),
  ]);

  const perKode = new Map(perKodeRows.map((r) => [r.kode, Number(r.c) || 0]));
  const mipil = perKode.get("MIPIL") ?? 0;
  const krama_tamiu = perKode.get("KRAMA_TAMIU") ?? 0;
  const tamiu = perKode.get("TAMIU") ?? 0;

  return {
    total_krama: [...perKode.values()].reduce((s, c) => s + c, 0),
    mipil,
    krama_tamiu,
    tamiu,
    pemasih: krama_tamiu + tamiu,
    per_jenis: {
      mipil: mipilRows,
      krama_tamiu: kramaTamiuRows,
      tamiu: tamiuRows,
    },
  };
}

/**
 * Komposisi krama aktif (Mipil / Krama Tamiu / Tamiu + rincian per jenis).
 * Dipakai Dashboard dan Ringkasan Eksekutif — tanpa query keuangan/tren.
 */
export async function getDemografiKrama(opts?: {
  paksaMuatUlang?: boolean;
}): Promise<LaporanEksekutifDemografi> {
  const ttl = opts?.paksaMuatUlang ? 0 : undefined;
  const snapshotKey = "demografi-krama:v1";

  if (!opts?.paksaMuatUlang) {
    const snap = await readRingkasanCache<LaporanEksekutifDemografi>(snapshotKey);
    if (snap) return snap;
  }

  const demografi = await cachedQuery("eksekutif:demografi", loadDemografiKrama, ttl);

  if (!opts?.paksaMuatUlang) {
    void writeRingkasanCache(snapshotKey, demografi);
  }
  return demografi;
}
