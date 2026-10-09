import { getDb } from "../db/client";
import { isPosAlokasiKasDudukan } from "./kas-dudukan-alokasi";
import type { PosBiayaRow } from "../types";
import { uuid } from "../utils";

export async function listPosBiaya(aktifOnly = true): Promise<PosBiayaRow[]> {
  const db = await getDb();
  let sql = `SELECT * FROM pos_biaya`;
  if (aktifOnly) sql += ` WHERE aktif = 1`;
  sql += ` ORDER BY urutan, nama`;
  return db.select<PosBiayaRow[]>(sql);
}

export async function createPosBiaya(params: {
  nama: string;
  keterangan?: string;
  urutan?: number;
}): Promise<string> {
  const nama = params.nama.trim();
  if (!nama) throw new Error("Nama pos biaya wajib diisi");
  const id = uuid();
  const db = await getDb();
  await db.execute(
    `INSERT INTO pos_biaya (id, nama, keterangan, urutan, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [id, nama, params.keterangan?.trim() || null, params.urutan ?? 99]
  );
  return id;
}

export async function updatePosBiaya(
  id: string,
  params: { nama: string; keterangan?: string; urutan?: number; aktif?: boolean }
): Promise<void> {
  const nama = params.nama.trim();
  if (!nama) throw new Error("Nama pos biaya wajib diisi");
  if (params.aktif === false && (await isPosAlokasiKasDudukan(id))) {
    throw new Error("Pos alokasi Dana Dudukan wajib tetap aktif.");
  }
  const db = await getDb();
  await db.execute(
    `UPDATE pos_biaya SET nama = ?, keterangan = ?, urutan = ?, aktif = ? WHERE id = ?`,
    [
      nama,
      params.keterangan?.trim() || null,
      params.urutan ?? 99,
      params.aktif === false ? 0 : 1,
      id,
    ]
  );
}

export async function deletePosBiaya(id: string): Promise<void> {
  if (await isPosAlokasiKasDudukan(id)) {
    throw new Error(
      "Pos biaya ini bagian alokasi Dana Dudukan dan tidak dapat dihapus. Ubah persentase di master alokasi jika perlu."
    );
  }
  const db = await getDb();
  const used = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM transaksi_pengeluaran_pos WHERE pos_biaya_id = ?`,
    [id]
  );
  if ((used[0]?.c ?? 0) > 0) {
    throw new Error("Pos biaya sudah dipakai — nonaktifkan saja");
  }
  await db.execute(`DELETE FROM pos_biaya WHERE id = ?`, [id]);
}
