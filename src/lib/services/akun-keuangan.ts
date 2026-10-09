import { getDb } from "../db/client";
import type { AkunKeuanganJenis, AkunKeuanganKelompok, AkunKeuanganRow } from "../types";
import { uuid } from "../utils";

const JENIS_LABEL: Record<AkunKeuanganJenis, string> = {
  kas_dudukan: "Dana Dudukan",
  kas_paturunan: "Dana Paturunan",
  dana_kasukretan_lainnya: "Dana Kasukretan Lainnya",
  bank: "Bank",
  ewallet: "Dompet digital",
};

const AKUN_INTI: { jenis: AkunKeuanganKelompok; nama: string; urutan: number }[] = [
  { jenis: "kas_paturunan", nama: "Dana Paturunan", urutan: 1 },
  { jenis: "kas_dudukan", nama: "Dana Dudukan", urutan: 2 },
  { jenis: "dana_kasukretan_lainnya", nama: "Dana Kasukretan Lainnya", urutan: 3 },
];

const SUB_JENIS_BY_KELOMPOK: Record<AkunKeuanganKelompok, AkunKeuanganJenis[]> = {
  kas_dudukan: ["kas_dudukan", "bank", "ewallet"],
  kas_paturunan: ["kas_paturunan", "bank", "ewallet"],
  dana_kasukretan_lainnya: ["dana_kasukretan_lainnya", "bank", "ewallet"],
};

export function labelAkunKeuanganJenis(jenis: AkunKeuanganJenis): string {
  return JENIS_LABEL[jenis] ?? jenis;
}

export function isAkunKeuanganInti(jenis: AkunKeuanganJenis): boolean {
  return (
    jenis === "kas_dudukan" ||
    jenis === "kas_paturunan" ||
    jenis === "dana_kasukretan_lainnya"
  );
}

export function isAkunKelompokRow(row: Pick<AkunKeuanganRow, "is_kelompok">): boolean {
  return row.is_kelompok === 1;
}

/** Urutan tampilan induk kelompok: Paturunan di atas, Dudukan di bawah. */
export function kelompokDisplayOrder(jenis: AkunKeuanganJenis): number {
  if (jenis === "kas_paturunan") return 1;
  if (jenis === "kas_dudukan") return 2;
  if (jenis === "dana_kasukretan_lainnya") return 3;
  return 99;
}

export function sortKelompokAkun<T extends { jenis: AkunKeuanganJenis; urutan?: number; nama?: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const byJenis = kelompokDisplayOrder(a.jenis) - kelompokDisplayOrder(b.jenis);
    if (byJenis !== 0) return byJenis;
    const byUrutan = (a.urutan ?? 0) - (b.urutan ?? 0);
    if (byUrutan !== 0) return byUrutan;
    return (a.nama ?? "").localeCompare(b.nama ?? "", "id");
  });
}

export function formatAkunPembayaranLabel(
  akun: AkunKeuanganRow,
  parent?: Pick<AkunKeuanganRow, "nama"> | null
): string {
  if (parent?.nama?.trim()) {
    const short = stripSubAkunPrefix(parent.nama, akun.nama);
    return `${parent.nama.trim()} › ${short || akun.nama}`;
  }
  return akun.nama;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Nama singkat sub-akun tanpa prefix induk kelompok. */
export function stripSubAkunPrefix(parentNama: string, akunNama: string): string {
  const parent = parentNama.trim();
  if (!parent) return akunNama.trim();
  const prefixRe = new RegExp(`^${escapeRegExp(parent)}\\s*[—–-]\\s*`, "i");
  return akunNama.replace(prefixRe, "").trim();
}

/** Gabungkan nama induk kelompok dengan label sub yang diinput pengguna. */
export function formatSubAkunKelompokNama(parentNama: string, inputNama: string): string {
  const parent = parentNama.trim();
  const nama = inputNama.trim();
  if (!nama) return "";
  if (!parent) return nama;
  const prefixRe = new RegExp(`^${escapeRegExp(parent)}\\s*[—–-]\\s*`, "i");
  if (prefixRe.test(nama)) return nama;
  return `${parent} - ${nama}`;
}

/** Nama tampilan akun — sub-akun selalu menyertakan prefix induk kelompok. */
export function resolveAkunDisplayNama(
  akun: Pick<AkunKeuanganRow, "nama" | "parent_akun_id" | "is_kelompok">,
  allAkun: Pick<AkunKeuanganRow, "id" | "nama">[]
): string {
  if (!akun.parent_akun_id || isAkunKelompokRow(akun as AkunKeuanganRow)) {
    return akun.nama.trim();
  }
  const parent = allAkun.find((a) => a.id === akun.parent_akun_id);
  if (!parent?.nama?.trim()) return akun.nama.trim();
  return formatSubAkunKelompokNama(parent.nama, akun.nama);
}

export function akunPembayaranOptionLabel(
  akun: AkunKeuanganRow,
  allAkun: AkunKeuanganRow[]
): string {
  return resolveAkunDisplayNama(akun, allAkun);
}

async function ensureAkunKeuanganInti(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  for (const item of AKUN_INTI) {
    const kelompok = await db.select<{ id: string }[]>(
      `SELECT id FROM akun_keuangan WHERE jenis = ? AND is_kelompok = 1 LIMIT 1`,
      [item.jenis]
    );
    if (kelompok[0]) continue;

    const legacy = await db.select<{ id: string }[]>(
      `SELECT id FROM akun_keuangan WHERE jenis = ? LIMIT 1`,
      [item.jenis]
    );
    if (legacy[0]) continue;

    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan, is_kelompok, created_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))`,
      [uuid(), item.nama, item.jenis, item.urutan]
    );
  }
}

export async function listAkunKeuangan(aktifOnly = true): Promise<AkunKeuanganRow[]> {
  const db = await getDb();
  await ensureAkunKeuanganInti(db);
  let sql = `SELECT * FROM akun_keuangan`;
  if (aktifOnly) sql += ` WHERE aktif = 1`;
  sql += ` ORDER BY urutan, nama`;
  return db.select<AkunKeuanganRow[]>(sql);
}

export async function getKelompokAkunIntiId(
  jenis: AkunKeuanganKelompok
): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM akun_keuangan WHERE jenis = ? AND is_kelompok = 1 AND aktif = 1 LIMIT 1`,
    [jenis]
  );
  return rows[0]?.id ?? null;
}

export async function listSubAkunKelompok(kelompokId: string): Promise<AkunKeuanganRow[]> {
  const db = await getDb();
  return db.select<AkunKeuanganRow[]>(
    `SELECT * FROM akun_keuangan
     WHERE parent_akun_id = ? AND COALESCE(is_kelompok, 0) = 0 AND aktif = 1
     ORDER BY urutan, nama`,
    [kelompokId]
  );
}

export async function listAkunIdsInKelompok(kelompokId: string): Promise<string[]> {
  const subs = await listSubAkunKelompok(kelompokId);
  return subs.map((s) => s.id);
}

export async function resolveKelompokIdForAkun(akunId: string): Promise<string | null> {
  const row = await getAkunKeuangan(akunId);
  if (!row) return null;
  if (isAkunKelompokRow(row)) return row.id;
  if (row.parent_akun_id?.trim()) return row.parent_akun_id.trim();
  if (
    row.jenis === "kas_dudukan" ||
    row.jenis === "kas_paturunan" ||
    row.jenis === "dana_kasukretan_lainnya"
  ) {
    return getKelompokAkunIntiId(row.jenis);
  }
  return null;
}

export async function isAkunInKelompokInti(
  akunId: string,
  jenis: AkunKeuanganKelompok
): Promise<boolean> {
  const row = await getAkunKeuangan(akunId);
  if (!row || row.aktif !== 1) return false;
  if (isAkunKelompokRow(row)) return false;
  const kelompokId = await getKelompokAkunIntiId(jenis);
  if (!kelompokId) {
    return row.jenis === jenis && !row.parent_akun_id;
  }
  return row.parent_akun_id === kelompokId;
}

export async function isAkunInKelompokKasDudukan(akunId: string): Promise<boolean> {
  return isAkunInKelompokInti(akunId, "kas_dudukan");
}

export async function assertAkunTransaksional(akunId: string): Promise<void> {
  const row = await getAkunKeuangan(akunId);
  if (!row || row.aktif !== 1) throw new Error("Akun keuangan tidak valid");
  if (isAkunKelompokRow(row)) {
    throw new Error("Akun induk kelompok tidak menerima transaksi langsung. Pilih sub-akun (Tunai/Bank).");
  }
}

async function listSubAkunForPembayaran(jenis: AkunKeuanganKelompok): Promise<AkunKeuanganRow[]> {
  const kelompokId = await getKelompokAkunIntiId(jenis);
  if (kelompokId) {
    const subs = await listSubAkunKelompok(kelompokId);
    if (subs.length > 0) return subs;
  }
  const rows = await listAkunKeuangan(true);
  const allowed = SUB_JENIS_BY_KELOMPOK[jenis];
  return rows.filter((a) => allowed.includes(a.jenis) && !isAkunKelompokRow(a));
}

export async function listAkunForPembayaranDudukan(): Promise<AkunKeuanganRow[]> {
  return listSubAkunForPembayaran("kas_dudukan");
}

export async function listAkunForPembayaranPaturunan(): Promise<AkunKeuanganRow[]> {
  return listSubAkunForPembayaran("kas_paturunan");
}

async function resolveDefaultSubAkunId(jenis: AkunKeuanganKelompok): Promise<string | null> {
  const kelompokId = await getKelompokAkunIntiId(jenis);
  if (kelompokId) {
    const db = await getDb();
    const rows = await db.select<{ id: string }[]>(
      `SELECT id FROM akun_keuangan
       WHERE parent_akun_id = ? AND jenis = ? AND aktif = 1
       ORDER BY urutan, nama LIMIT 1`,
      [kelompokId, jenis]
    );
    if (rows[0]) return rows[0].id;
    const anySub = await db.select<{ id: string }[]>(
      `SELECT id FROM akun_keuangan
       WHERE parent_akun_id = ? AND aktif = 1
       ORDER BY urutan, nama LIMIT 1`,
      [kelompokId]
    );
    if (anySub[0]) return anySub[0].id;
  }
  return resolveDefaultAkunIdLegacy(jenis);
}

export async function getDefaultAkunDudukanId(): Promise<string> {
  const id = await resolveDefaultSubAkunId("kas_dudukan");
  if (!id) throw new Error("Akun Dana Dudukan belum dikonfigurasi di Master Data");
  return id;
}

export async function getDefaultAkunPaturunanId(): Promise<string> {
  const id = await resolveDefaultSubAkunId("kas_paturunan");
  if (!id) throw new Error("Akun Dana Paturunan belum dikonfigurasi di Master Data");
  return id;
}

export async function getDefaultAkunDanaKasukretanLainnyaId(): Promise<string> {
  const id = await resolveDefaultSubAkunId("dana_kasukretan_lainnya");
  if (!id) throw new Error("Akun Dana Kasukretan Lainnya belum dikonfigurasi di Master Data");
  return id;
}

async function resolveDefaultAkunIdLegacy(jenis: AkunKeuanganJenis): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM akun_keuangan
     WHERE jenis = ? AND aktif = 1 AND COALESCE(is_kelompok, 0) = 0
     ORDER BY urutan, nama LIMIT 1`,
    [jenis]
  );
  return rows[0]?.id ?? null;
}

export async function assertAkunForPembayaranDudukan(akunId: string): Promise<void> {
  await assertAkunTransaksional(akunId);
  if (!(await isAkunInKelompokInti(akunId, "kas_dudukan"))) {
    throw new Error("Akun tidak boleh untuk pembayaran dudukan");
  }
}

export async function assertAkunForPembayaranPaturunan(akunId: string): Promise<void> {
  await assertAkunTransaksional(akunId);
  if (!(await isAkunInKelompokInti(akunId, "kas_paturunan"))) {
    throw new Error("Akun tidak boleh untuk pembayaran paturunan");
  }
}

export async function assertAkunForDanaKasukretanLainnya(akunId: string): Promise<void> {
  await assertAkunTransaksional(akunId);
  if (!(await isAkunInKelompokInti(akunId, "dana_kasukretan_lainnya"))) {
    throw new Error("Akun tidak termasuk Dana Kasukretan Lainnya");
  }
}

export async function isAkunInKelompokDanaKasukretanLainnya(akunId: string): Promise<boolean> {
  return isAkunInKelompokInti(akunId, "dana_kasukretan_lainnya");
}

export async function getAkunKeuangan(id: string): Promise<AkunKeuanganRow | null> {
  const db = await getDb();
  const rows = await db.select<AkunKeuanganRow[]>(`SELECT * FROM akun_keuangan WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function createAkunKeuangan(params: {
  nama: string;
  jenis: AkunKeuanganJenis;
  keterangan?: string;
  urutan?: number;
}): Promise<string> {
  if (isAkunKeuanganInti(params.jenis)) {
    throw new Error(
      `Akun ${labelAkunKeuanganJenis(params.jenis)} dibuat sebagai kelompok induk. Tambah sub-akun dari Master Data.`
    );
  }
  const nama = params.nama.trim();
  if (!nama) throw new Error("Nama akun wajib diisi");
  const id = uuid();
  const db = await getDb();
  await db.execute(
    `INSERT INTO akun_keuangan (id, nama, jenis, keterangan, urutan, is_kelompok, created_at)
     VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
    [id, nama, params.jenis, params.keterangan?.trim() || null, params.urutan ?? 99]
  );
  return id;
}

export async function createSubAkunKelompok(params: {
  kelompokId: string;
  nama: string;
  jenis: AkunKeuanganJenis;
  keterangan?: string;
  urutan?: number;
}): Promise<string> {
  const parent = await getAkunKeuangan(params.kelompokId);
  if (!parent || !isAkunKelompokRow(parent)) {
    throw new Error("Induk kelompok tidak valid");
  }
  const kelompokJenis = parent.jenis as AkunKeuanganKelompok;
  if (!SUB_JENIS_BY_KELOMPOK[kelompokJenis]?.includes(params.jenis)) {
    throw new Error("Jenis sub-akun tidak valid untuk kelompok ini");
  }
  const nama = formatSubAkunKelompokNama(parent.nama, params.nama);
  if (!nama) throw new Error("Nama sub-akun wajib diisi");

  if (params.jenis === kelompokJenis) {
    const db = await getDb();
    const exists = await db.select<{ id: string }[]>(
      `SELECT id FROM akun_keuangan
       WHERE parent_akun_id = ? AND jenis = ? AND aktif = 1 LIMIT 1`,
      [params.kelompokId, params.jenis]
    );
    if (exists[0]) {
      throw new Error(`Sub-akun tunai (${labelAkunKeuanganJenis(params.jenis)}) sudah ada`);
    }
  }

  const id = uuid();
  const db = await getDb();
  await db.execute(
    `INSERT INTO akun_keuangan
      (id, nama, jenis, keterangan, urutan, parent_akun_id, is_kelompok, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
    [
      id,
      nama,
      params.jenis,
      params.keterangan?.trim() || null,
      params.urutan ?? 99,
      params.kelompokId,
    ]
  );
  return id;
}

export async function updateAkunKeuangan(
  id: string,
  params: { nama: string; jenis: AkunKeuanganJenis; keterangan?: string; urutan?: number; aktif?: boolean }
): Promise<void> {
  const namaInput = params.nama.trim();
  if (!namaInput) throw new Error("Nama akun wajib diisi");

  const db = await getDb();
  const existing = await getAkunKeuangan(id);
  if (!existing) throw new Error("Akun keuangan tidak ditemukan");

  let nama = namaInput;
  if (existing.parent_akun_id) {
    const parent = await getAkunKeuangan(existing.parent_akun_id);
    if (parent) nama = formatSubAkunKelompokNama(parent.nama, namaInput);
  }

  if (isAkunKelompokRow(existing)) {
    if (params.jenis !== existing.jenis) {
      throw new Error(`Jenis akun ${labelAkunKeuanganJenis(existing.jenis)} tidak dapat diubah.`);
    }
    if (params.aktif === false) {
      throw new Error(`Akun ${labelAkunKeuanganJenis(existing.jenis)} wajib tetap aktif.`);
    }
  } else if (existing.parent_akun_id && isAkunKeuanganInti(params.jenis)) {
    const parent = await getAkunKeuangan(existing.parent_akun_id);
    if (parent && params.jenis !== existing.jenis && params.jenis === parent.jenis) {
      // allow keeping tunai jenis
    } else if (parent && !SUB_JENIS_BY_KELOMPOK[parent.jenis as AkunKeuanganKelompok]?.includes(params.jenis)) {
      throw new Error("Jenis sub-akun tidak valid untuk kelompok induk");
    }
  }

  await db.execute(
    `UPDATE akun_keuangan SET nama = ?, jenis = ?, keterangan = ?, urutan = ?, aktif = ?
     WHERE id = ?`,
    [
      nama,
      params.jenis,
      params.keterangan?.trim() || null,
      params.urutan ?? existing.urutan ?? 99,
      params.aktif === false ? 0 : 1,
      id,
    ]
  );
}

export async function deleteAkunKeuangan(id: string): Promise<void> {
  const row = await getAkunKeuangan(id);
  if (!row) throw new Error("Akun keuangan tidak ditemukan.");
  if (isAkunKelompokRow(row)) {
    throw new Error(
      `${row.nama} adalah akun induk kelompok dan tidak dapat dihapus. Kelola sub-akun di bawahnya.`
    );
  }

  const db = await getDb();
  const used = await db.select<{ c: number }[]>(
    `SELECT (
       (SELECT COUNT(*) FROM paturunan_pembayaran WHERE akun_keuangan_id = ?) +
       (SELECT COUNT(*) FROM dudukan_pembayaran WHERE akun_keuangan_id = ?) +
       (SELECT COUNT(*) FROM transaksi_pengeluaran WHERE akun_keuangan_id = ?) +
       (SELECT COUNT(*) FROM transaksi_pemasukan WHERE akun_keuangan_id = ?) +
       (SELECT COUNT(*) FROM transaksi_transfer WHERE akun_asal_id = ? OR akun_tujuan_id = ?)
     ) as c`,
    [id, id, id, id, id, id]
  );
  if ((used[0]?.c ?? 0) > 0) {
    throw new Error(
      "Akun ini sudah dipakai dalam transaksi keuangan. Nonaktifkan akun jika tidak ingin dipakai lagi, alih-alih menghapus."
    );
  }
  await db.execute(`DELETE FROM akun_keuangan WHERE id = ?`, [id]);
}

export function isAkunSubOfKelompok(
  akun: AkunKeuanganRow | undefined,
  kelompokJenis: AkunKeuanganKelompok,
  allAkun: AkunKeuanganRow[]
): boolean {
  if (!akun || isAkunKelompokRow(akun)) return false;
  if (akun.parent_akun_id?.trim()) {
    const parent = allAkun.find((a) => a.id === akun.parent_akun_id);
    return parent?.jenis === kelompokJenis;
  }
  return akun.jenis === kelompokJenis;
}

/** Urutan tampilan: kelompok + sub, lalu akun mandiri. */
export async function listAkunKeuanganHierarkis(aktifOnly = true): Promise<AkunKeuanganRow[]> {
  const all = await listAkunKeuangan(aktifOnly);
  const kelompok = sortKelompokAkun(all.filter((a) => isAkunKelompokRow(a)));
  const subs = all.filter((a) => a.parent_akun_id && !isAkunKelompokRow(a));
  const standalone = all.filter((a) => !a.parent_akun_id && !isAkunKelompokRow(a));

  const out: AkunKeuanganRow[] = [];
  for (const k of kelompok) {
    out.push(k);
    out.push(...subs.filter((s) => s.parent_akun_id === k.id));
  }
  out.push(...standalone);
  return out;
}
