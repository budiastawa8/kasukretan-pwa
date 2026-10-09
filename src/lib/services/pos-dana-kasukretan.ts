import { getDb } from "../db/client";
import type { PosBiayaRow, PosPemasukanRow } from "../types";
import { uuid } from "../utils";

export const KELOMPOK_DANA_KASUKRETAN = "dana_kasukretan_lainnya" as const;

export const POS_PEMASUKAN_DANA_NAMA = {
  biayaAdminPemasih: "Biaya Administrasi Pemasih",
  puniaKasukretan: "Punia Kasukretan",
  danaKerjasama: "Dana Kerjasama Kasukretan",
  danaSewa: "Dana Sewa",
} as const;

export async function listPosPemasukanDanaKasukretan(
  aktifOnly = true
): Promise<PosPemasukanRow[]> {
  const db = await getDb();
  let sql = `SELECT * FROM pos_pemasukan WHERE kelompok_akun = ?`;
  const args: unknown[] = [KELOMPOK_DANA_KASUKRETAN];
  if (aktifOnly) sql += ` AND aktif = 1`;
  sql += ` ORDER BY urutan, nama`;
  return db.select<PosPemasukanRow[]>(sql, args);
}

export async function listPosPengeluaranDanaKasukretan(
  aktifOnly = true
): Promise<PosBiayaRow[]> {
  const db = await getDb();
  let sql = `SELECT * FROM pos_biaya WHERE kelompok_akun = ? AND COALESCE(is_system, 0) = 0`;
  const args: unknown[] = [KELOMPOK_DANA_KASUKRETAN];
  if (aktifOnly) sql += ` AND aktif = 1`;
  sql += ` ORDER BY urutan, nama`;
  return db.select<PosBiayaRow[]>(sql, args);
}

export async function getPosPemasukanDanaByNama(nama: string): Promise<PosPemasukanRow | null> {
  const db = await getDb();
  const rows = await db.select<PosPemasukanRow[]>(
    `SELECT * FROM pos_pemasukan WHERE kelompok_akun = ? AND nama = ? LIMIT 1`,
    [KELOMPOK_DANA_KASUKRETAN, nama]
  );
  return rows[0] ?? null;
}

export async function getPosBiayaAdminPemasihId(): Promise<string> {
  const pos = await getPosPemasukanDanaByNama(POS_PEMASUKAN_DANA_NAMA.biayaAdminPemasih);
  if (!pos) throw new Error("Pos Biaya Administrasi Pemasih belum dikonfigurasi");
  return pos.id;
}

export async function createPosPengeluaranDanaKasukretan(nama: string): Promise<string> {
  const trimmed = nama.trim();
  if (!trimmed) throw new Error("Nama pos pengeluaran wajib diisi");
  const id = uuid();
  const db = await getDb();
  await db.execute(
    `INSERT INTO pos_biaya (id, nama, urutan, kelompok_akun, is_system, aktif, created_at)
     VALUES (?, ?, 99, ?, 0, 1, datetime('now'))`,
    [id, trimmed, KELOMPOK_DANA_KASUKRETAN]
  );
  return id;
}

export async function updatePosPengeluaranDanaKasukretan(
  id: string,
  params: { nama: string; aktif?: boolean }
): Promise<void> {
  const db = await getDb();
  const row = await db.select<{ is_system: number }[]>(
    `SELECT is_system FROM pos_biaya WHERE id = ? AND kelompok_akun = ?`,
    [id, KELOMPOK_DANA_KASUKRETAN]
  );
  if (!row[0]) throw new Error("Pos pengeluaran tidak ditemukan");
  if (row[0].is_system === 1) throw new Error("Pos sistem tidak dapat diubah");
  const nama = params.nama.trim();
  if (!nama) throw new Error("Nama pos wajib diisi");
  await db.execute(`UPDATE pos_biaya SET nama = ?, aktif = ? WHERE id = ?`, [
    nama,
    params.aktif === false ? 0 : 1,
    id,
  ]);
}

export async function deletePosPengeluaranDanaKasukretan(id: string): Promise<void> {
  const db = await getDb();
  const row = await db.select<{ is_system: number }[]>(
    `SELECT is_system FROM pos_biaya WHERE id = ? AND kelompok_akun = ?`,
    [id, KELOMPOK_DANA_KASUKRETAN]
  );
  if (!row[0]) throw new Error("Pos pengeluaran tidak ditemukan");
  if (row[0].is_system === 1) throw new Error("Pos sistem tidak dapat dihapus");
  const used = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM transaksi_pengeluaran_pos WHERE pos_biaya_id = ?`,
    [id]
  );
  if ((used[0]?.c ?? 0) > 0) throw new Error("Pos sudah dipakai — nonaktifkan saja");
  await db.execute(`DELETE FROM pos_biaya WHERE id = ?`, [id]);
}
