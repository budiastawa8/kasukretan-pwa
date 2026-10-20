import { getDb } from "../db/client";
import { getDesaAdat } from "./desa";
import { isTimBantuanFiturAktif, TIM_TIPE_BANTUAN } from "../tim-bantuan";

/**
 * True jika user terhubung ke Tim Bantuan tetapi fitur desa sedang mati
 * (login / sesi harus ditolak meskipun baris user masih aktif).
 */
export async function isTimBantuanLoginDiblokir(userId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ tipe: string | null }[]>(
    `SELECT t.tipe
     FROM user u
     JOIN tim_kasukretan t ON t.id = u.tim_kasukretan_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );
  const tipe = rows[0]?.tipe;
  if (tipe !== TIM_TIPE_BANTUAN) return false;
  const desa = await getDesaAdat();
  return !isTimBantuanFiturAktif(desa);
}
