import { getDb } from "../db/client";
import { collectPetugasAkunForSync } from "../services/petugas-akun";
import { cloudFetch } from "./cloud-config";

export async function collectCatalogFromDesktop() {
  const db = await getDb();
  const desa = (await db.select<Record<string, unknown>[]>(`SELECT * FROM desa_adat LIMIT 1`))[0] ?? null;
  const klasifikasi = await db.select<Record<string, unknown>[]>(`SELECT * FROM klasifikasi_krama`);
  const banjar = await db.select<Record<string, unknown>[]>(`SELECT * FROM banjar WHERE aktif = 1`);
  const iuran = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM iuran_paturunan WHERE aktif = 1`
  );
  const tempek = await db.select<Record<string, unknown>[]>(
    `SELECT t.*, b.kode as banjar_kode, b.desa_adat_id
     FROM tempek t
     JOIN banjar b ON b.id = t.banjar_id
     WHERE t.aktif = 1`
  );
  const arahan = await db.select<Record<string, unknown>[]>(
    `SELECT a.*
     FROM arahan a
     JOIN tempek t ON t.id = a.tempek_id AND t.aktif = 1
     WHERE a.aktif = 1`
  );
  // Tanpa foto_url (data URL) — foto hanya untuk cetak kartu di desktop.
  const tim = await db.select<Record<string, unknown>[]>(
    `SELECT t.id, t.nama, t.banjar_id, t.jabatan, t.nomor_kontak, t.tipe,
            t.nomor_pengenal, COALESCE(t.aktif, 1) AS aktif,
            t.created_at, t.updated_at,
            b.kode as banjar_kode, b.desa_adat_id
     FROM tim_kasukretan t
     JOIN banjar b ON b.id = t.banjar_id`
  );
  const jenisMipil = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM jenis_krama_mipil WHERE aktif = 1`
  );
  const jenisKramaTamiu = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM jenis_krama_tamiu WHERE aktif = 1`
  );
  const jenisTamiu = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM jenis_tamiu WHERE aktif = 1`
  );
  const akunKeuangan = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM akun_keuangan WHERE aktif = 1`
  );
  return {
    desa,
    klasifikasi,
    banjar,
    tempek,
    arahan,
    iuran,
    tim,
    akunKeuangan,
    jenisMipil,
    jenisKramaTamiu,
    jenisTamiu,
  };
}

export async function pushCatalogToCloud() {
  const payload = await collectCatalogFromDesktop();
  const petugasUsers = await collectPetugasAkunForSync();
  return cloudFetch<{ ok: boolean; result: Record<string, unknown> }>("/sync/catalog/push", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      ...(petugasUsers.length > 0 ? { petugasUsers } : {}),
    }),
  });
}
