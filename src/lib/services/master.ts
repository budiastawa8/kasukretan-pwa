import { getDb } from "../db/client";
import type {
  Arahan,
  Banjar,
  JenisKramaMipilRow,
  JenisKramaTamiuRow,
  JenisTamiuRow,
  Tempek,
  TimKasukretan,
} from "../types";
import { parseMasaBerlakuTahun } from "../masa-berlaku";
import { parsePaturunanPersen } from "../paturunan-hitung";
import { uuid } from "../utils";

/** Master jarang berubah — cache memori agar filter/dropdown tidak round-trip ulang. */
const MASTER_LIST_TTL_MS = 5 * 60_000;
type MasterListEntry<T> = { at: number; rows: T };
let banjarListCache: MasterListEntry<Banjar[]> | null = null;
let jenisMipilListCache: MasterListEntry<JenisKramaMipilRow[]> | null = null;
let jenisKramaTamiuListCache: MasterListEntry<JenisKramaTamiuRow[]> | null = null;
let jenisTamiuListCache: MasterListEntry<JenisTamiuRow[]> | null = null;

export function invalidateMasterListCache(): void {
  banjarListCache = null;
  jenisMipilListCache = null;
  jenisKramaTamiuListCache = null;
  jenisTamiuListCache = null;
}

function cloneList<T>(rows: T[]): T[] {
  return structuredClone(rows);
}

function listFromCache<T>(entry: MasterListEntry<T[]> | null): T[] | null {
  if (!entry) return null;
  if (Date.now() - entry.at > MASTER_LIST_TTL_MS) return null;
  return cloneList(entry.rows);
}

/** Prefetch setelah koneksi siap — digabung batch SELECT di klien LAN. */
export async function prefetchMasterLists(): Promise<void> {
  await Promise.all([listBanjar(), listJenisMipil(), listJenisKramaTamiu(), listJenisTamiu()]);
}

const KRAMA_REF_COLUMNS = [
  "banjar_id",
  "tempek_id",
  "arahan_id",
  "jenis_krama_mipil_id",
  "jenis_krama_tamiu_id",
  "jenis_tamiu_id",
] as const;

function requireNama(nama: string): string {
  const trimmed = nama.trim();
  if (!trimmed) throw new Error("Nama wajib diisi");
  return trimmed;
}

function requireJabatan(jabatan: string): string {
  const trimmed = jabatan.trim();
  if (!trimmed) throw new Error("Jabatan wajib diisi");
  return trimmed;
}

async function assertBanjarAktif(banjarId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM banjar WHERE id = $1 AND aktif = 1`,
    [banjarId]
  );
  if ((rows[0]?.c ?? 0) === 0) throw new Error("Banjar tidak ditemukan");
}

async function countKramaRef(
  column: (typeof KRAMA_REF_COLUMNS)[number],
  id: string
): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM krama WHERE ${column} = $1 AND status_krama = 'aktif'`,
    [id]
  );
  return rows[0]?.c ?? 0;
}

export async function listBanjar(): Promise<Banjar[]> {
  const cached = listFromCache(banjarListCache);
  if (cached) return cached;
  const db = await getDb();
  const rows = await db.select<Banjar[]>(
    `SELECT * FROM banjar WHERE aktif = 1 ORDER BY kode ASC`
  );
  banjarListCache = { at: Date.now(), rows };
  return cloneList(rows);
}

export async function createBanjar(desaAdatId: string, nama: string, kode: string) {
  const db = await getDb();
  const id = uuid();
  await db.execute(
    `INSERT INTO banjar (id, desa_adat_id, nama, kode) VALUES ($1, $2, $3, $4)`,
    [id, desaAdatId, requireNama(nama), kode.padStart(2, "0").slice(-2)]
  );
  invalidateMasterListCache();
  return id;
}

export async function updateBanjar(id: string, nama: string, kode: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ kode: string }[]>(`SELECT kode FROM banjar WHERE id = $1`, [id]);
  const current = rows[0];
  if (!current) throw new Error("Banjar tidak ditemukan");

  const normalized = kode.padStart(2, "0").slice(-2);
  if (normalized !== current.kode && (await countKramaRef("banjar_id", id)) > 0) {
    throw new Error("Kode banjar tidak dapat diubah karena sudah dipakai Krama");
  }

  await db.execute(
    `UPDATE banjar SET nama = $1, kode = $2, updated_at = datetime('now') WHERE id = $3`,
    [requireNama(nama), normalized, id]
  );
  invalidateMasterListCache();
}

export async function deleteBanjar(id: string): Promise<void> {
  if ((await countKramaRef("banjar_id", id)) > 0) {
    throw new Error("Banjar tidak dapat dihapus karena masih dipakai Krama");
  }
  const db = await getDb();
  const tempekRows = await db.select<{ id: string }[]>(
    `SELECT id FROM tempek WHERE banjar_id = $1`,
    [id]
  );
  for (const t of tempekRows) {
    await db.execute(`UPDATE arahan SET aktif = 0 WHERE tempek_id = $1`, [t.id]);
    await db.execute(`UPDATE tempek SET aktif = 0 WHERE id = $1`, [t.id]);
  }
  await db.execute(`UPDATE banjar SET aktif = 0 WHERE id = $1`, [id]);
  invalidateMasterListCache();
}

export async function listTempek(banjarId: string): Promise<Tempek[]> {
  const db = await getDb();
  return db.select<Tempek[]>(
    `SELECT * FROM tempek WHERE banjar_id = $1 AND aktif = 1 ORDER BY created_at ASC`,
    [banjarId]
  );
}

export async function createTempek(banjarId: string, nama: string, kode?: string) {
  if (!banjarId) throw new Error("Pilih banjar terlebih dahulu");
  const db = await getDb();
  const banjar = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM banjar WHERE id = $1 AND aktif = 1`,
    [banjarId]
  );
  if ((banjar[0]?.c ?? 0) === 0) throw new Error("Banjar tidak ditemukan");

  const id = uuid();
  await db.execute(
    `INSERT INTO tempek (id, banjar_id, nama, kode, aktif, created_at) VALUES ($1, $2, $3, $4, 1, datetime('now'))`,
    [id, banjarId, requireNama(nama), kode?.trim() || null]
  );
  return id;
}

export async function updateTempek(id: string, nama: string, kode?: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE tempek SET nama = $1, kode = $2 WHERE id = $3`, [
    requireNama(nama),
    kode?.trim() || null,
    id,
  ]);
}

export async function deleteTempek(id: string): Promise<void> {
  if ((await countKramaRef("tempek_id", id)) > 0) {
    throw new Error("Tempek tidak dapat dihapus karena masih dipakai Krama");
  }
  const db = await getDb();
  await db.execute(`UPDATE arahan SET aktif = 0 WHERE tempek_id = $1`, [id]);
  await db.execute(`UPDATE tempek SET aktif = 0 WHERE id = $1`, [id]);
}

export async function listArahan(tempekId: string): Promise<Arahan[]> {
  const db = await getDb();
  return db.select<Arahan[]>(
    `SELECT * FROM arahan WHERE tempek_id = $1 AND aktif = 1 ORDER BY created_at ASC`,
    [tempekId]
  );
}

export async function createArahan(tempekId: string, nama: string, kode?: string) {
  if (!tempekId) throw new Error("Pilih tempek terlebih dahulu");
  const db = await getDb();
  const tempek = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM tempek WHERE id = $1 AND aktif = 1`,
    [tempekId]
  );
  if ((tempek[0]?.c ?? 0) === 0) throw new Error("Tempek tidak ditemukan");

  const id = uuid();
  await db.execute(
    `INSERT INTO arahan (id, tempek_id, nama, kode, aktif, created_at) VALUES ($1, $2, $3, $4, 1, datetime('now'))`,
    [id, tempekId, requireNama(nama), kode?.trim() || null]
  );
  return id;
}

export async function updateArahan(id: string, nama: string, kode?: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE arahan SET nama = $1, kode = $2 WHERE id = $3`, [
    requireNama(nama),
    kode?.trim() || null,
    id,
  ]);
}

export async function deleteArahan(id: string): Promise<void> {
  if ((await countKramaRef("arahan_id", id)) > 0) {
    throw new Error("Arahan tidak dapat dihapus karena masih dipakai Krama");
  }
  const db = await getDb();
  await db.execute(`UPDATE arahan SET aktif = 0 WHERE id = $1`, [id]);
}

export async function listJenisMipil(): Promise<JenisKramaMipilRow[]> {
  const cached = listFromCache(jenisMipilListCache);
  if (cached) return cached;
  const db = await getDb();
  const rows = await db.select<JenisKramaMipilRow[]>(
    `SELECT * FROM jenis_krama_mipil WHERE aktif = 1 ORDER BY created_at ASC, nama ASC`
  );
  jenisMipilListCache = { at: Date.now(), rows };
  return cloneList(rows);
}

export async function createJenisMipil(
  nama: string,
  paturunanPersen: number,
  kode?: string,
  keterangan?: string
) {
  const db = await getDb();
  const id = uuid();
  await db.execute(
    `INSERT INTO jenis_krama_mipil (id, nama, kode, paturunan_persen, keterangan, created_at) VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
    [
      id,
      requireNama(nama),
      kode?.trim() || null,
      parsePaturunanPersen(paturunanPersen),
      keterangan ?? null,
    ]
  );
  invalidateMasterListCache();
  return id;
}

export async function updateJenisMipil(
  id: string,
  nama: string,
  paturunanPersen: number,
  kode?: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE jenis_krama_mipil SET nama = $1, kode = $2, paturunan_persen = $3 WHERE id = $4`,
    [requireNama(nama), kode?.trim() || null, parsePaturunanPersen(paturunanPersen), id]
  );
  invalidateMasterListCache();
}

export async function deleteJenisMipil(id: string): Promise<void> {
  if ((await countKramaRef("jenis_krama_mipil_id", id)) > 0) {
    throw new Error("Jenis tidak dapat dihapus karena masih dipakai Krama");
  }
  const db = await getDb();
  await db.execute(`UPDATE jenis_krama_mipil SET aktif = 0 WHERE id = $1`, [id]);
  invalidateMasterListCache();
}

export async function listJenisKramaTamiu(): Promise<JenisKramaTamiuRow[]> {
  const cached = listFromCache(jenisKramaTamiuListCache);
  if (cached) return cached;
  const db = await getDb();
  const rows = await db.select<JenisKramaTamiuRow[]>(
    `SELECT * FROM jenis_krama_tamiu WHERE aktif = 1 ORDER BY created_at ASC, nama ASC`
  );
  jenisKramaTamiuListCache = { at: Date.now(), rows };
  return cloneList(rows);
}

export async function createJenisKramaTamiu(
  nama: string,
  dudukanNominal: number,
  kode?: string,
  keterangan?: string
) {
  const db = await getDb();
  const id = uuid();
  await db.execute(
    `INSERT INTO jenis_krama_tamiu (id, nama, kode, dudukan_nominal, keterangan, created_at) VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
    [id, requireNama(nama), kode?.trim() || null, dudukanNominal, keterangan ?? null]
  );
  invalidateMasterListCache();
  return id;
}

export async function updateJenisKramaTamiu(
  id: string,
  nama: string,
  dudukanNominal: number,
  kode?: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE jenis_krama_tamiu SET nama = $1, kode = $2, dudukan_nominal = $3 WHERE id = $4`,
    [requireNama(nama), kode?.trim() || null, dudukanNominal, id]
  );
  invalidateMasterListCache();
}

export async function deleteJenisKramaTamiu(id: string): Promise<void> {
  if ((await countKramaRef("jenis_krama_tamiu_id", id)) > 0) {
    throw new Error("Jenis tidak dapat dihapus karena masih dipakai Krama");
  }
  const db = await getDb();
  await db.execute(`UPDATE jenis_krama_tamiu SET aktif = 0 WHERE id = $1`, [id]);
  invalidateMasterListCache();
}

export async function listJenisTamiu(): Promise<JenisTamiuRow[]> {
  const cached = listFromCache(jenisTamiuListCache);
  if (cached) return cached;
  const db = await getDb();
  const rows = await db.select<JenisTamiuRow[]>(
    `SELECT * FROM jenis_tamiu WHERE aktif = 1 ORDER BY created_at ASC, nama ASC`
  );
  jenisTamiuListCache = { at: Date.now(), rows };
  return cloneList(rows);
}

export async function createJenisTamiu(
  nama: string,
  dudukanNominal: number,
  kode?: string,
  keterangan?: string
) {
  const db = await getDb();
  const id = uuid();
  await db.execute(
    `INSERT INTO jenis_tamiu (id, nama, kode, dudukan_nominal, keterangan, created_at) VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
    [id, requireNama(nama), kode?.trim() || null, dudukanNominal, keterangan ?? null]
  );
  invalidateMasterListCache();
  return id;
}

export async function updateJenisTamiu(
  id: string,
  nama: string,
  dudukanNominal: number,
  kode?: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE jenis_tamiu SET nama = $1, kode = $2, dudukan_nominal = $3 WHERE id = $4`,
    [requireNama(nama), kode?.trim() || null, dudukanNominal, id]
  );
  invalidateMasterListCache();
}

export async function deleteJenisTamiu(id: string): Promise<void> {
  if ((await countKramaRef("jenis_tamiu_id", id)) > 0) {
    throw new Error("Jenis tidak dapat dihapus karena masih dipakai Krama");
  }
  const db = await getDb();
  await db.execute(`UPDATE jenis_tamiu SET aktif = 0 WHERE id = $1`, [id]);
  invalidateMasterListCache();
}

export async function updateJenisMipilMasaBerlaku(
  id: string,
  masaBerlakuTahun: number | null
): Promise<void> {
  const tahun = masaBerlakuTahun == null ? null : parseMasaBerlakuTahun(masaBerlakuTahun);
  const db = await getDb();
  await db.execute(`UPDATE jenis_krama_mipil SET masa_berlaku_tahun = $1 WHERE id = $2`, [
    tahun,
    id,
  ]);
  invalidateMasterListCache();
}

export async function updateJenisKramaTamiuMasaBerlaku(
  id: string,
  masaBerlakuTahun: number | null
): Promise<void> {
  await updateJenisKramaTamiuIlikita(id, masaBerlakuTahun, null);
}

export async function updateJenisTamiuMasaBerlaku(
  id: string,
  masaBerlakuTahun: number | null
): Promise<void> {
  await updateJenisTamiuIlikita(id, masaBerlakuTahun, null);
}

export async function updateJenisKramaTamiuIlikita(
  id: string,
  masaBerlakuTahun: number | null,
  autoPerpanjang: boolean | null
): Promise<void> {
  const tahun = masaBerlakuTahun == null ? null : parseMasaBerlakuTahun(masaBerlakuTahun);
  const auto = tahun != null && autoPerpanjang ? 1 : 0;
  const db = await getDb();
  if (autoPerpanjang == null) {
    await db.execute(`UPDATE jenis_krama_tamiu SET masa_berlaku_tahun = $1 WHERE id = $2`, [
      tahun,
      id,
    ]);
    if (tahun == null) {
      await db.execute(`UPDATE jenis_krama_tamiu SET auto_perpanjang = 0 WHERE id = $1`, [id]);
    }
    invalidateMasterListCache();
    return;
  }
  await db.execute(
    `UPDATE jenis_krama_tamiu SET masa_berlaku_tahun = $1, auto_perpanjang = $2 WHERE id = $3`,
    [tahun, auto, id]
  );
  invalidateMasterListCache();
}

export async function updateJenisTamiuIlikita(
  id: string,
  masaBerlakuTahun: number | null,
  autoPerpanjang: boolean | null
): Promise<void> {
  const tahun = masaBerlakuTahun == null ? null : parseMasaBerlakuTahun(masaBerlakuTahun);
  const auto = tahun != null && autoPerpanjang ? 1 : 0;
  const db = await getDb();
  if (autoPerpanjang == null) {
    await db.execute(`UPDATE jenis_tamiu SET masa_berlaku_tahun = $1 WHERE id = $2`, [tahun, id]);
    if (tahun == null) {
      await db.execute(`UPDATE jenis_tamiu SET auto_perpanjang = 0 WHERE id = $1`, [id]);
    }
    invalidateMasterListCache();
    return;
  }
  await db.execute(
    `UPDATE jenis_tamiu SET masa_berlaku_tahun = $1, auto_perpanjang = $2 WHERE id = $3`,
    [tahun, auto, id]
  );
  invalidateMasterListCache();
}

export async function listTimKasukretan(banjarId?: string): Promise<TimKasukretan[]> {
  const db = await getDb();
  let sql = `
    SELECT t.id, t.nama, t.banjar_id, t.jabatan, t.created_at, t.updated_at,
           b.nama as banjar_nama, b.kode as banjar_kode
    FROM tim_kasukretan t
    JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1
  `;
  const args: unknown[] = [];
  if (banjarId?.trim()) {
    sql += ` WHERE t.banjar_id = $1`;
    args.push(banjarId);
  }
  sql += ` ORDER BY t.nama ASC`;
  return db.select<TimKasukretan[]>(sql, args);
}

export async function createTimKasukretan(
  nama: string,
  banjarId: string,
  jabatan: string
): Promise<string> {
  if (!banjarId?.trim()) throw new Error("Banjar wajib dipilih");
  await assertBanjarAktif(banjarId);
  const db = await getDb();
  const id = uuid();
  await db.execute(
    `INSERT INTO tim_kasukretan (id, nama, banjar_id, jabatan) VALUES ($1, $2, $3, $4)`,
    [id, requireNama(nama), banjarId, requireJabatan(jabatan)]
  );
  return id;
}

export async function updateTimKasukretan(
  id: string,
  nama: string,
  banjarId: string,
  jabatan: string
): Promise<void> {
  if (!banjarId?.trim()) throw new Error("Banjar wajib dipilih");
  await assertBanjarAktif(banjarId);
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM tim_kasukretan WHERE id = $1`,
    [id]
  );
  if ((rows[0]?.c ?? 0) === 0) throw new Error("Anggota tim tidak ditemukan");
  await db.execute(
    `UPDATE tim_kasukretan SET
      nama = $1, banjar_id = $2, jabatan = $3, updated_at = datetime('now')
     WHERE id = $4`,
    [requireNama(nama), banjarId, requireJabatan(jabatan), id]
  );
}

export async function deleteTimKasukretan(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM tim_kasukretan WHERE id = $1`, [id]);
}

export async function countJenisByKlasifikasi(kode: string): Promise<number> {
  const db = await getDb();
  if (kode === "MIPIL") {
    const r = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM jenis_krama_mipil WHERE aktif = 1`
    );
    return r[0]?.c ?? 0;
  }
  if (kode === "KRAMA_TAMIU") {
    const r = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM jenis_krama_tamiu WHERE aktif = 1`
    );
    return r[0]?.c ?? 0;
  }
  const r = await db.select<{ c: number }[]>(`SELECT COUNT(*) as c FROM jenis_tamiu WHERE aktif = 1`);
  return r[0]?.c ?? 0;
}
