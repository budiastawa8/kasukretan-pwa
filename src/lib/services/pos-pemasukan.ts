import { getDb } from "../db/client";
import type { PosPemasukanRow } from "../types";
import { uuid } from "../utils";

export async function listPosPemasukan(aktifOnly = true): Promise<PosPemasukanRow[]> {
  const db = await getDb();
  let sql = `SELECT * FROM pos_pemasukan`;
  if (aktifOnly) sql += ` WHERE aktif = 1`;
  sql += ` ORDER BY urutan, nama`;
  return db.select<PosPemasukanRow[]>(sql);
}

export async function createPosPemasukan(params: {
  nama: string;
  keterangan?: string;
  urutan?: number;
}): Promise<string> {
  const nama = params.nama.trim();
  if (!nama) throw new Error("Nama pos pemasukan wajib diisi");
  const id = uuid();
  const db = await getDb();
  await db.execute(
    `INSERT INTO pos_pemasukan (id, nama, keterangan, urutan, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [id, nama, params.keterangan?.trim() || null, params.urutan ?? 99]
  );
  return id;
}

export async function updatePosPemasukan(
  id: string,
  params: { nama: string; keterangan?: string; urutan?: number; aktif?: boolean }
): Promise<void> {
  const nama = params.nama.trim();
  if (!nama) throw new Error("Nama pos pemasukan wajib diisi");
  const db = await getDb();
  await db.execute(
    `UPDATE pos_pemasukan SET nama = ?, keterangan = ?, urutan = ?, aktif = ? WHERE id = ?`,
    [
      nama,
      params.keterangan?.trim() || null,
      params.urutan ?? 99,
      params.aktif === false ? 0 : 1,
      id,
    ]
  );
}

export async function deletePosPemasukan(id: string): Promise<void> {
  const db = await getDb();
  const used = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM transaksi_pemasukan_pos WHERE pos_pemasukan_id = ?`,
    [id]
  );
  if ((used[0]?.c ?? 0) > 0) {
    throw new Error("Pos pemasukan sudah dipakai — nonaktifkan saja");
  }
  await db.execute(`DELETE FROM pos_pemasukan WHERE id = ?`, [id]);
}
