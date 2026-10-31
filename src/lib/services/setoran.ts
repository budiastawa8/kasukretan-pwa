import { getDb } from "../db/client";
import { parseIsoDateString } from "../date-iso";
import { formatTanggalLahir, uuid } from "../utils";

export type SumberPembayaran = "paturunan" | "dudukan" | "dana_lain";

const TABEL_PEMBAYARAN: Record<SumberPembayaran, string> = {
  paturunan: "paturunan_pembayaran",
  dudukan: "dudukan_pembayaran",
  dana_lain: "penerimaan_dana_lain",
};

const SEMUA_SUMBER: SumberPembayaran[] = ["paturunan", "dudukan", "dana_lain"];

export type UangBelumDisetorPetugas = {
  petugas_id: string | null;
  petugas_nama: string;
  petugas_jabatan: string | null;
  petugas_nomor_kontak: string | null;
  jumlah_transaksi: number;
  total: number;
  /** Tanggal bayar paling lama yang belum disetor. */
  tanggal_tertua: string;
};

export type PembayaranSetoranItem = {
  sumber: SumberPembayaran;
  id: string;
  tanggal: string;
  jumlah: number;
  nomor_kartu: string;
  kepala_nama: string;
  uraian: string;
  akun_nama: string | null;
  petugas_id: string | null;
  created_at: string;
  /** Kosong = masih di tangan petugas. */
  tanggal_setor?: string | null;
  setoran_id?: string | null;
  /** Hanya untuk sumber dana_lain: punia_kasukretan | dana_kerjasama */
  jenis_dana?: string | null;
};

export type SetoranRow = {
  id: string;
  petugas_id: string | null;
  petugas_nama: string | null;
  tanggal: string;
  total: number;
  keterangan: string | null;
  diterima_oleh_nama: string | null;
  jumlah_transaksi: number;
  created_at: string;
};

/** Uang yang masih dipegang petugas, dikelompokkan per petugas. */
export async function listUangBelumDisetorPerPetugas(): Promise<UangBelumDisetorPetugas[]> {
  const db = await getDb();
  const rows = await db.select<UangBelumDisetorPetugas[]>(
    `SELECT x.petugas_id,
            COALESCE(t.nama, 'Tanpa petugas') as petugas_nama,
            t.jabatan as petugas_jabatan,
            t.nomor_kontak as petugas_nomor_kontak,
            COUNT(*) as jumlah_transaksi,
            COALESCE(SUM(x.jumlah), 0) as total,
            MIN(x.tanggal) as tanggal_tertua
     FROM (
       SELECT petugas_id, jumlah, tanggal FROM paturunan_pembayaran WHERE tanggal_setor IS NULL
       UNION ALL
       SELECT petugas_id, jumlah, tanggal FROM dudukan_pembayaran WHERE tanggal_setor IS NULL
       UNION ALL
       SELECT petugas_id, jumlah, tanggal FROM penerimaan_dana_lain WHERE tanggal_setor IS NULL
     ) x
     LEFT JOIN tim_kasukretan t ON t.id = x.petugas_id
     GROUP BY x.petugas_id
     ORDER BY tanggal_tertua ASC, petugas_nama ASC`
  );
  return rows.map((r) => ({
    ...r,
    petugas_nomor_kontak: r.petugas_nomor_kontak?.trim() || null,
    jumlah_transaksi: Number(r.jumlah_transaksi) || 0,
    total: Math.round(Number(r.total) || 0),
  }));
}

async function selectPembayaranItems(
  wherePaturunan: string,
  whereDudukan: string,
  whereDanaLain: string,
  args: unknown[]
): Promise<PembayaranSetoranItem[]> {
  const db = await getDb();
  const rows = await db.select<PembayaranSetoranItem[]>(
    `SELECT * FROM (
       SELECT 'paturunan' as sumber, p.id, p.tanggal, p.jumlah, k.nomor_kartu,
              pd.nama_lengkap as kepala_nama,
              'Paturunan ' || i.nama ||
                CASE WHEN COALESCE(p.jenis, 'wajib') = 'punia' THEN ' (punia)' ELSE '' END as uraian,
              a.nama as akun_nama, p.petugas_id, p.created_at,
              p.tanggal_setor, p.setoran_id,
              NULL as jenis_dana
       FROM paturunan_pembayaran p
       JOIN krama k ON k.id = p.krama_id
       JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
       JOIN iuran_paturunan i ON i.id = p.iuran_id
       LEFT JOIN akun_keuangan a ON a.id = p.akun_keuangan_id
       WHERE ${wherePaturunan}
       UNION ALL
       SELECT 'dudukan' as sumber, p.id, p.tanggal, p.jumlah, k.nomor_kartu,
              pd.nama_lengkap as kepala_nama,
              'Dudukan ' || printf('%02d', p.bulan) || '/' || p.tahun as uraian,
              a.nama as akun_nama, p.petugas_id, p.created_at,
              p.tanggal_setor, p.setoran_id,
              NULL as jenis_dana
       FROM dudukan_pembayaran p
       JOIN krama k ON k.id = p.krama_id
       JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
       LEFT JOIN akun_keuangan a ON a.id = p.akun_keuangan_id
       WHERE ${whereDudukan}
       UNION ALL
       SELECT 'dana_lain' as sumber, p.id, p.tanggal, p.jumlah,
              COALESCE(k.nomor_kartu, '—') as nomor_kartu,
              COALESCE(
                NULLIF(TRIM(p.sumber_nama), ''),
                pd.nama_lengkap,
                lb.nama,
                '—'
              ) as kepala_nama,
              CASE p.jenis
                WHEN 'punia_kasukretan' THEN 'Punia Kasukretan'
                ELSE 'Dana Kerjasama Kasukretan'
              END ||
              CASE
                WHEN TRIM(COALESCE(p.kegiatan, '')) != '' THEN ' · ' || TRIM(p.kegiatan)
                ELSE ''
              END as uraian,
              a.nama as akun_nama, p.petugas_id, p.created_at,
              p.tanggal_setor, p.setoran_id,
              p.jenis as jenis_dana
       FROM penerimaan_dana_lain p
       LEFT JOIN krama k ON k.id = p.krama_id
       LEFT JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
       LEFT JOIN lembaga_badan lb ON lb.id = p.lembaga_badan_id
       LEFT JOIN akun_keuangan a ON a.id = p.akun_keuangan_id
       WHERE ${whereDanaLain}
     )
     ORDER BY tanggal ASC, created_at ASC`,
    args
  );
  return rows.map((r) => ({ ...r, jumlah: Math.round(Number(r.jumlah) || 0) }));
}

/** Pembayaran yang uangnya masih dipegang satu petugas (`null` = tanpa petugas). */
export async function listPembayaranBelumDisetor(
  petugasId: string | null
): Promise<PembayaranSetoranItem[]> {
  const where = "p.tanggal_setor IS NULL AND p.petugas_id IS ?";
  return selectPembayaranItems(where, where, where, [petugasId, petugasId, petugasId]);
}

/** Semua pembayaran yang dicatat petugas ini (sudah/belum disetor), opsional filter tanggal. */
export async function listPembayaranOlehPetugas(params: {
  petugasId: string;
  dari?: string;
  sampai?: string;
  /** Jika true, tanpa Paturunan (Tim Bantuan: Dudukan + Punia/Kerjasama). */
  hanyaDudukan?: boolean;
}): Promise<PembayaranSetoranItem[]> {
  const dari = params.dari ? parseIsoDateString(params.dari) : null;
  const sampai = params.sampai ? parseIsoDateString(params.sampai) : null;
  const parts: string[] = ["p.petugas_id IS ?"];
  const args: unknown[] = [params.petugasId];
  if (dari) {
    parts.push("p.tanggal >= ?");
    args.push(dari);
  }
  if (sampai) {
    parts.push("p.tanggal <= ?");
    args.push(sampai);
  }
  const where = parts.join(" AND ");
  if (params.hanyaDudukan) {
    // Paturunan tidak dipakai; Dudukan + dana lain memakai argumen yang sama.
    return selectPembayaranItems("1 = 0", where, where, [...args, ...args]);
  }
  return selectPembayaranItems(where, where, where, [...args, ...args, ...args]);
}

export async function listPembayaranDalamSetoran(
  setoranId: string
): Promise<PembayaranSetoranItem[]> {
  const where = "p.setoran_id = ?";
  return selectPembayaranItems(where, where, where, [setoranId, setoranId, setoranId]);
}

export async function listSetoran(params?: {
  petugasId?: string;
  dari?: string;
  sampai?: string;
  limit?: number;
}): Promise<SetoranRow[]> {
  const db = await getDb();
  let sql = `
    SELECT s.id, s.petugas_id, t.nama as petugas_nama, s.tanggal, s.total, s.keterangan,
           COALESCE(NULLIF(TRIM(u.nama), ''), u.username) as diterima_oleh_nama,
           (SELECT COUNT(*) FROM paturunan_pembayaran WHERE setoran_id = s.id) +
           (SELECT COUNT(*) FROM dudukan_pembayaran WHERE setoran_id = s.id) +
           (SELECT COUNT(*) FROM penerimaan_dana_lain WHERE setoran_id = s.id) as jumlah_transaksi,
           s.created_at
    FROM setoran s
    LEFT JOIN tim_kasukretan t ON t.id = s.petugas_id
    LEFT JOIN user u ON u.id = s.diterima_oleh
    WHERE 1=1`;
  const args: unknown[] = [];
  if (params?.petugasId) {
    sql += ` AND s.petugas_id = ?`;
    args.push(params.petugasId);
  }
  const dari = params?.dari ? parseIsoDateString(params.dari) : null;
  if (dari) {
    sql += ` AND s.tanggal >= ?`;
    args.push(dari);
  }
  const sampai = params?.sampai ? parseIsoDateString(params.sampai) : null;
  if (sampai) {
    sql += ` AND s.tanggal <= ?`;
    args.push(sampai);
  }
  sql += ` ORDER BY s.tanggal DESC, s.created_at DESC LIMIT ?`;
  args.push(params?.limit ?? 100);

  const rows = await db.select<SetoranRow[]>(sql, args);
  return rows.map((r) => ({
    ...r,
    total: Math.round(Number(r.total) || 0),
    jumlah_transaksi: Number(r.jumlah_transaksi) || 0,
  }));
}

function inPlaceholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

/**
 * Bendahara menerima uang dari petugas: pembayaran terpilih masuk buku kas
 * dengan tanggal setor.
 */
export async function terimaSetoran(params: {
  petugasId: string | null;
  tanggal: string;
  keterangan?: string;
  items: { sumber: SumberPembayaran; id: string }[];
  diterimaOleh: string;
}): Promise<{ id: string; total: number; jumlahTransaksi: number }> {
  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal setor tidak valid");
  if (params.items.length === 0) throw new Error("Pilih minimal satu pembayaran yang disetor");

  const db = await getDb();
  const idsBySumber: Record<SumberPembayaran, string[]> = {
    paturunan: [],
    dudukan: [],
    dana_lain: [],
  };
  for (const item of params.items) idsBySumber[item.sumber].push(item.id);

  let total = 0;
  let jumlahTransaksi = 0;
  let tanggalBayarTerakhir = "";
  for (const sumber of SEMUA_SUMBER) {
    const ids = idsBySumber[sumber];
    if (ids.length === 0) continue;
    const rows = await db.select<{ jumlah: number; tanggal: string }[]>(
      `SELECT jumlah, tanggal FROM ${TABEL_PEMBAYARAN[sumber]}
       WHERE id IN (${inPlaceholders(ids.length)})
         AND tanggal_setor IS NULL AND petugas_id IS ?`,
      [...ids, params.petugasId]
    );
    if (rows.length !== ids.length) {
      throw new Error(
        "Sebagian pembayaran sudah disetor, dihapus, atau berganti petugas. Muat ulang daftar lalu coba lagi."
      );
    }
    for (const r of rows) {
      total += Math.round(Number(r.jumlah) || 0);
      if (r.tanggal > tanggalBayarTerakhir) tanggalBayarTerakhir = r.tanggal;
    }
    jumlahTransaksi += rows.length;
  }

  if (tanggalBayarTerakhir && tanggal < tanggalBayarTerakhir) {
    throw new Error(
      `Tanggal setor tidak boleh sebelum tanggal bayar terakhir (${formatTanggalLahir(tanggalBayarTerakhir)})`
    );
  }

  const id = uuid();
  await db.execute(
    `INSERT INTO setoran (id, petugas_id, tanggal, total, keterangan, diterima_oleh, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [id, params.petugasId, tanggal, total, params.keterangan?.trim() || null, params.diterimaOleh]
  );
  for (const sumber of SEMUA_SUMBER) {
    const ids = idsBySumber[sumber];
    if (ids.length === 0) continue;
    await db.execute(
      `UPDATE ${TABEL_PEMBAYARAN[sumber]} SET setoran_id = ?, tanggal_setor = ?
       WHERE id IN (${inPlaceholders(ids.length)}) AND tanggal_setor IS NULL`,
      [id, tanggal, ...ids]
    );
  }
  return { id, total, jumlahTransaksi };
}

/** Pembayaran dalam setoran kembali berstatus belum disetor dan keluar dari buku kas. */
export async function batalkanSetoran(setoranId: string): Promise<void> {
  const db = await getDb();
  for (const table of Object.values(TABEL_PEMBAYARAN)) {
    await db.execute(
      `UPDATE ${table} SET setoran_id = NULL, tanggal_setor = NULL WHERE setoran_id = ?`,
      [setoranId]
    );
  }
  await db.execute(`DELETE FROM setoran WHERE id = ?`, [setoranId]);
}

/** Pembayaran yang sudah masuk setoran dikunci agar buku kas tidak berubah diam-diam. */
export async function assertPembayaranBelumMasukSetoran(
  sumber: SumberPembayaran,
  pembayaranId: string
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ setoran_id: string | null; tanggal_setoran: string | null }[]>(
    `SELECT p.setoran_id, s.tanggal as tanggal_setoran
     FROM ${TABEL_PEMBAYARAN[sumber]} p
     LEFT JOIN setoran s ON s.id = p.setoran_id
     WHERE p.id = ?`,
    [pembayaranId]
  );
  const row = rows[0];
  if (!row?.setoran_id) return;
  throw new Error(
    `Pembayaran ini sudah disetor ke bendahara (${formatTanggalLahir(row.tanggal_setoran)}). ` +
      "Batalkan setorannya dulu di Keuangan → Setoran untuk mengubah atau menghapus."
  );
}

/** Hapus pembayaran yang belum masuk batch setoran (paturunan / dudukan / dana lain). */
export async function deletePembayaranBelumDisetor(
  sumber: SumberPembayaran,
  id: string
): Promise<void> {
  if (sumber === "paturunan") {
    const { deletePembayaranPaturunan } = await import("./paturunan-pembayaran");
    await deletePembayaranPaturunan(id);
    return;
  }
  if (sumber === "dudukan") {
    const { deletePembayaranDudukan } = await import("./dudukan-pembayaran");
    await deletePembayaranDudukan(id);
    return;
  }
  const { deletePenerimaanDanaLain } = await import("./penerimaan-dana-lain");
  await deletePenerimaanDanaLain(id);
}
