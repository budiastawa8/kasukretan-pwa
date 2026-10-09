import { parseIsoDateString } from "../date-iso";
import { parseJumlahPembayaran } from "../paturunan-hitung";
import { getDb } from "../db/client";
import type { TransaksiPemasukanRow } from "../types";
import { uuid } from "../utils";
import { assertAkunTransaksional } from "./akun-keuangan";

export type PemasukanPosInput = {
  posPemasukanId: string;
  jumlah: number;
  keterangan?: string;
};

export async function listTransaksiPemasukan(params?: {
  akunKeuanganId?: string;
  limit?: number;
}): Promise<TransaksiPemasukanRow[]> {
  const db = await getDb();
  let sql = `
    SELECT t.*, a.nama as akun_keuangan_nama, u.nama as created_by_nama,
           (SELECT COALESCE(SUM(pp.jumlah), 0) FROM transaksi_pemasukan_pos pp WHERE pp.transaksi_id = t.id) as total_jumlah,
           (SELECT GROUP_CONCAT(TRIM(pp.keterangan), ' ')
            FROM transaksi_pemasukan_pos pp
            WHERE pp.transaksi_id = t.id
              AND TRIM(COALESCE(pp.keterangan, '')) != '') as pos_keterangan
    FROM transaksi_pemasukan t
    JOIN akun_keuangan a ON a.id = t.akun_keuangan_id
    LEFT JOIN user u ON u.id = t.created_by
    WHERE 1=1
  `;
  const args: unknown[] = [];
  if (params?.akunKeuanganId) {
    sql += ` AND t.akun_keuangan_id = ?`;
    args.push(params.akunKeuanganId);
  }
  sql += ` ORDER BY t.tanggal DESC, t.created_at DESC`;
  if (params?.limit && params.limit > 0) {
    sql += ` LIMIT ?`;
    args.push(params.limit);
  }
  return db.select<TransaksiPemasukanRow[]>(sql, args);
}

export async function getTransaksiPemasukan(id: string): Promise<TransaksiPemasukanRow | null> {
  const rows = await listTransaksiPemasukan();
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const db = await getDb();
  const pos = await db.select<
    {
      id: string;
      transaksi_id: string;
      pos_pemasukan_id: string;
      pos_pemasukan_nama: string;
      jumlah: number;
      keterangan: string | null;
    }[]
  >(
    `SELECT pp.*, pb.nama as pos_pemasukan_nama
     FROM transaksi_pemasukan_pos pp
     JOIN pos_pemasukan pb ON pb.id = pp.pos_pemasukan_id
     WHERE pp.transaksi_id = ?
     ORDER BY pp.id`,
    [id]
  );
  return {
    ...row,
    pos: pos.map((p) => ({
      id: p.id,
      transaksi_id: p.transaksi_id,
      pos_pemasukan_id: p.pos_pemasukan_id,
      pos_pemasukan_nama: p.pos_pemasukan_nama,
      jumlah: Math.round(Number(p.jumlah) || 0),
      keterangan: p.keterangan,
    })),
  };
}

function validatePemasukanInput(params: {
  tanggal: string;
  pos: PemasukanPosInput[];
}): { tanggal: string; lines: { posPemasukanId: string; jumlah: number; keterangan: string | null }[] } {
  if (!params.pos.length) throw new Error("Minimal satu pos pemasukan");

  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal tidak valid");

  const lines = params.pos.map((p) => {
    const jumlah = parseJumlahPembayaran(p.jumlah);
    if (jumlah <= 0) throw new Error("Jumlah pos pemasukan harus lebih dari 0");
    if (!p.posPemasukanId?.trim()) throw new Error("Pos pemasukan wajib dipilih");
    return {
      posPemasukanId: p.posPemasukanId.trim(),
      jumlah,
      keterangan: p.keterangan?.trim() || null,
    };
  });

  return { tanggal, lines };
}

export async function createTransaksiPemasukan(params: {
  akunKeuanganId: string;
  tanggal: string;
  keterangan?: string;
  /** Kosong untuk transaksi otomatis sistem (biaya admin ILIKITA, dll.) */
  createdBy?: string | null;
  pos: PemasukanPosInput[];
}): Promise<string> {
  await assertAkunTransaksional(params.akunKeuanganId);

  const { tanggal, lines } = validatePemasukanInput(params);

  const db = await getDb();
  const transaksiId = uuid();
  await db.execute(
    `INSERT INTO transaksi_pemasukan (id, akun_keuangan_id, tanggal, keterangan, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [
      transaksiId,
      params.akunKeuanganId,
      tanggal,
      params.keterangan?.trim() || null,
      params.createdBy ?? null,
    ]
  );

  for (const line of lines) {
    await db.execute(
      `INSERT INTO transaksi_pemasukan_pos (id, transaksi_id, pos_pemasukan_id, jumlah, keterangan)
       VALUES (?, ?, ?, ?, ?)`,
      [uuid(), transaksiId, line.posPemasukanId, line.jumlah, line.keterangan]
    );
  }

  return transaksiId;
}

export async function updateTransaksiPemasukan(
  id: string,
  params: {
    akunKeuanganId: string;
    tanggal: string;
    keterangan?: string;
    pos: PemasukanPosInput[];
  }
): Promise<void> {
  await assertAkunTransaksional(params.akunKeuanganId);

  const db = await getDb();
  const existing = await db.select<{ id: string }[]>(
    `SELECT id FROM transaksi_pemasukan WHERE id = ?`,
    [id]
  );
  if (!existing[0]) throw new Error("Transaksi pemasukan tidak ditemukan");

  const { tanggal, lines } = validatePemasukanInput(params);

  await db.execute(
    `UPDATE transaksi_pemasukan
     SET akun_keuangan_id = ?, tanggal = ?, keterangan = ?
     WHERE id = ?`,
    [params.akunKeuanganId, tanggal, params.keterangan?.trim() || null, id]
  );

  await db.execute(`DELETE FROM transaksi_pemasukan_pos WHERE transaksi_id = ?`, [id]);

  for (const line of lines) {
    await db.execute(
      `INSERT INTO transaksi_pemasukan_pos (id, transaksi_id, pos_pemasukan_id, jumlah, keterangan)
       VALUES (?, ?, ?, ?, ?)`,
      [uuid(), id, line.posPemasukanId, line.jumlah, line.keterangan]
    );
  }
}

export async function deleteTransaksiPemasukan(id: string): Promise<void> {
  const db = await getDb();
  // Arsip IPMA / riwayat Pemasih menyimpan transaksi_pemasukan_id — lepas dulu agar FK tidak blokir hapus.
  await db.execute(
    `UPDATE surat_keterangan_mautsaha_adat
     SET transaksi_pemasukan_id = NULL, akun_keuangan_id = NULL
     WHERE transaksi_pemasukan_id = ?`,
    [id]
  );
  await db.execute(
    `UPDATE pemasih_perpanjangan_riwayat SET transaksi_pemasukan_id = NULL WHERE transaksi_pemasukan_id = ?`,
    [id]
  );
  await db.execute(`DELETE FROM transaksi_pemasukan_pos WHERE transaksi_id = ?`, [id]);
  await db.execute(`DELETE FROM transaksi_pemasukan WHERE id = ?`, [id]);
}
