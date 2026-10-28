import { isJabatanPenerimaSemuaBanjar } from "../src/lib/petugas-jabatan.js";
import { HttpError, type PublicUser } from "./auth.js";
import { dbSelect, getClient, rowsToObjects } from "./db.js";
import type { PetugasGuard } from "./policy.js";
import { convertSql } from "./sql-convert.js";

type PetugasTim = { id: string; banjar_id: string; jabatan: string };

async function loadPetugasTim(userId: string): Promise<PetugasTim> {
  const rows = (await dbSelect(
    `SELECT t.id, t.banjar_id, t.jabatan
     FROM user u JOIN tim_kasukretan t ON t.id = u.tim_kasukretan_id
     WHERE u.id = ? AND u.aktif = 1`,
    [userId]
  )) as PetugasTim[];
  const tim = rows[0];
  if (!tim) {
    throw new HttpError(
      403,
      "Akun petugas belum dihubungkan ke nama di Tim Kasukretan. Hubungi admin."
    );
  }
  return tim;
}

function alasanTolakBaruPetugas(
  row: Record<string, unknown> | undefined,
  tim: PetugasTim
): string | null {
  if (!row) return "Krama pembayaran tidak ditemukan.";
  if (row.petugas_id !== tim.id) return "Petugas pembayaran harus akun Anda sendiri.";
  if (row.tanggal_setor != null || row.setoran_id != null) {
    return "Pembayaran dari petugas lapangan harus berstatus belum disetor.";
  }
  if (!(Number(row.jumlah) > 0)) return "Jumlah pembayaran harus lebih dari 0.";
  if (row.banjar_id !== tim.banjar_id && !isJabatanPenerimaSemuaBanjar(tim.jabatan)) {
    return "Krama ini bukan dari banjar wilayah Anda.";
  }
  return null;
}

const PESAN_BARIS_TIDAK_JELAS =
  "Perintah pembayaran tidak menghasilkan baris yang bisa diverifikasi.";

/** `0` berarti tidak ada INSERT yang berhasil (termasuk ON CONFLICT yang tidak menyisipkan). */
function rowidBarisTerakhir(value: bigint | undefined): bigint | null {
  if (value == null || value <= 0n) return null;
  return value;
}

/**
 * Tulis pembayaran oleh peran petugas. INSERT (satu atau beberapa baris dalam satu
 * perintah) dijalankan dalam transaksi lalu setiap baris baru diperiksa sebelum commit.
 * DELETE dibatasi ke milik sendiri yang belum disetor.
 *
 * Baris baru dikenali lewat rentang rowid `(lastInsertRowid - rowsAffected, lastInsertRowid]`.
 * SQLite mengisi rowid berurutan untuk INSERT ... VALUES pada tabel rowid biasa selama
 * perintah tidak menyebut rowid. Trigger yang menyisipkan baris ke tabel yang sama akan
 * merusak rentang itu; skema `paturunan_pembayaran` dan `dudukan_pembayaran` tidak punya trigger.
 */
export async function executePetugasPaymentWrite(
  user: PublicUser,
  guard: PetugasGuard,
  sql: string,
  bind: unknown[]
): Promise<{ rowsAffected: number }> {
  const tim = await loadPetugasTim(user.id);
  const { sql: converted, args } = convertSql(sql, bind);
  const client = await getClient();

  if (guard.verb === "delete") {
    const id = args[0];
    const rs = await client.execute({
      sql: `DELETE FROM ${guard.table}
            WHERE id = ? AND petugas_id = ? AND tanggal_setor IS NULL AND setoran_id IS NULL`,
      args: [id ?? null, tim.id],
    });
    if (rs.rowsAffected > 0) return { rowsAffected: rs.rowsAffected };
    const exists = await dbSelect(`SELECT petugas_id, tanggal_setor FROM ${guard.table} WHERE id = ?`, [
      id ?? null,
    ]);
    if (!exists[0]) return { rowsAffected: 0 };
    if (exists[0].petugas_id !== tim.id) {
      throw new HttpError(403, "Hanya pembayaran yang Anda catat sendiri yang bisa dihapus.");
    }
    throw new HttpError(
      403,
      "Pembayaran ini sudah disetor ke bendahara — minta bendahara untuk mengoreksinya."
    );
  }

  const tx = await client.transaction("write");
  try {
    const rs = await tx.execute({ sql: converted, args });
    const last = rowidBarisTerakhir(rs.lastInsertRowid);
    if (rs.rowsAffected < 1 || last == null) {
      throw new HttpError(403, PESAN_BARIS_TIDAK_JELAS);
    }
    const check = await tx.execute({
      sql: `SELECT p.petugas_id, p.tanggal_setor, p.setoran_id, p.jumlah, k.banjar_id
            FROM ${guard.table} p
            LEFT JOIN krama k ON k.id = p.krama_id
            WHERE p.rowid > ? AND p.rowid <= ?
            ORDER BY p.rowid`,
      args: [last - BigInt(rs.rowsAffected), last],
    });
    const rows = rowsToObjects(check);
    if (rows.length !== rs.rowsAffected) {
      throw new HttpError(403, PESAN_BARIS_TIDAK_JELAS);
    }
    for (const row of rows) {
      const alasan = alasanTolakBaruPetugas(row, tim);
      if (alasan) throw new HttpError(403, alasan);
    }
    await tx.commit();
    return { rowsAffected: rs.rowsAffected };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally {
    tx.close();
  }
}
