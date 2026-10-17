import { getDb } from "../db/client";
import { cachedQuery } from "../query-cache";
import { readRingkasanCache, writeRingkasanCache } from "./ringkasan-cache";

export type LaporanEksekutifJenisKrama = {
  jenis_id: string;
  jenis_nama: string;
  jumlah_krama: number;
};

/** Komposisi krama aktif per banjar (hasil GROUP BY, bukan scan baris di klien). */
export type LaporanEksekutifBanjarKomposisi = {
  banjar_id: string;
  banjar_kode: string;
  banjar_nama: string;
  mipil: number;
  krama_tamiu: number;
  tamiu: number;
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
  /** Per banjar adat — Mipil / Krama Tamiu / Tamiu */
  per_banjar: LaporanEksekutifBanjarKomposisi[];
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

async function loadKomposisiPerBanjar(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<LaporanEksekutifBanjarKomposisi[]> {
  const rows = await db.select<
    {
      banjar_id: string;
      banjar_kode: string;
      banjar_nama: string;
      mipil: number;
      krama_tamiu: number;
      tamiu: number;
    }[]
  >(
    `SELECT b.id as banjar_id, b.kode as banjar_kode, b.nama as banjar_nama,
            COALESCE(SUM(CASE WHEN kk.kode = 'MIPIL' THEN 1 ELSE 0 END), 0) as mipil,
            COALESCE(SUM(CASE WHEN kk.kode = 'KRAMA_TAMIU' THEN 1 ELSE 0 END), 0) as krama_tamiu,
            COALESCE(SUM(CASE WHEN kk.kode = 'TAMIU' THEN 1 ELSE 0 END), 0) as tamiu
     FROM banjar b
     LEFT JOIN krama k ON k.banjar_id = b.id AND k.status_krama = 'aktif'
     LEFT JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     GROUP BY b.id
     ORDER BY b.kode`
  );
  return rows.map((r) => ({
    banjar_id: r.banjar_id,
    banjar_kode: r.banjar_kode,
    banjar_nama: r.banjar_nama,
    mipil: Number(r.mipil) || 0,
    krama_tamiu: Number(r.krama_tamiu) || 0,
    tamiu: Number(r.tamiu) || 0,
  }));
}

async function loadDemografiKrama(): Promise<LaporanEksekutifDemografi> {
  const db = await getDb();
  const [mipilRows, kramaTamiuRows, tamiuRows, perKodeRows, perBanjar] = await Promise.all([
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
    loadKomposisiPerBanjar(db),
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
    per_banjar: perBanjar,
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
  /** v2: menambah per_banjar (agregasi komposisi per banjar). */
  const snapshotKey = "demografi-krama:v2";

  if (!opts?.paksaMuatUlang) {
    const snap = await readRingkasanCache<LaporanEksekutifDemografi>(snapshotKey);
    if (snap && Array.isArray(snap.per_banjar)) return snap;
  }

  const demografi = await cachedQuery("eksekutif:demografi:v2", loadDemografiKrama, ttl);

  if (!opts?.paksaMuatUlang) {
    void writeRingkasanCache(snapshotKey, demografi);
  }
  return demografi;
}
