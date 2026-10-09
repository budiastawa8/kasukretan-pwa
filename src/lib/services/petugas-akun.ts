import bcrypt from "bcryptjs";
import { getDb } from "../db/client";
import { validatePassword, validateUsername } from "../auth-password";
import { uuid } from "../utils";

export type PetugasAkunRecord = {
  id: string;
  username: string;
  tim_kasukretan_id: string;
  tim_nama: string;
  banjar_nama: string;
  nama: string | null;
  aktif: number;
  must_change_password: number;
  created_at: string;
  updated_at: string;
};

type PetugasAkunDbRow = {
  id: string;
  username: string;
  password_hash: string;
  tim_kasukretan_id: string;
  tim_nama: string;
  banjar_nama: string;
  nama: string | null;
  aktif: number;
  must_change_password: number;
  created_at: string;
  updated_at: string;
};

function mapRow(row: PetugasAkunDbRow): PetugasAkunRecord {
  return {
    id: row.id,
    username: row.username,
    tim_kasukretan_id: row.tim_kasukretan_id,
    tim_nama: row.tim_nama,
    banjar_nama: row.banjar_nama,
    nama: row.nama,
    aktif: row.aktif,
    must_change_password: row.must_change_password,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT_SQL = `
  SELECT p.id, p.username, p.password_hash, p.tim_kasukretan_id,
         t.nama as tim_nama, b.nama as banjar_nama,
         p.nama, p.aktif, p.must_change_password, p.created_at, p.updated_at
  FROM petugas_akun p
  JOIN tim_kasukretan t ON t.id = p.tim_kasukretan_id
  JOIN banjar b ON b.id = t.banjar_id
`;

export async function listPetugasAkun(): Promise<PetugasAkunRecord[]> {
  const db = await getDb();
  const rows = await db.select<PetugasAkunDbRow[]>(
    `${SELECT_SQL} ORDER BY p.username COLLATE NOCASE`
  );
  return rows.map(mapRow);
}

export async function getPetugasAkunById(id: string): Promise<PetugasAkunRecord | null> {
  const db = await getDb();
  const rows = await db.select<PetugasAkunDbRow[]>(`${SELECT_SQL} WHERE p.id = ?`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function assertTimExists(timId: string): Promise<{ nama: string }> {
  const db = await getDb();
  const rows = await db.select<{ nama: string }[]>(
    `SELECT nama FROM tim_kasukretan WHERE id = ?`,
    [timId]
  );
  const row = rows[0];
  if (!row) throw new Error("Anggota tim tidak ditemukan");
  return row;
}

async function assertUsernameFree(username: string, excludeId?: string): Promise<void> {
  const db = await getDb();
  const rows = excludeId
    ? await db.select<{ c: number }[]>(
        `SELECT COUNT(*) as c FROM petugas_akun WHERE lower(username) = lower(?) AND id != ?`,
        [username, excludeId]
      )
    : await db.select<{ c: number }[]>(
        `SELECT COUNT(*) as c FROM petugas_akun WHERE lower(username) = lower(?)`,
        [username]
      );
  if ((rows[0]?.c ?? 0) > 0) throw new Error("Username sudah dipakai");
}

async function assertTimNotLinked(timId: string, excludeId?: string): Promise<void> {
  const db = await getDb();
  const rows = excludeId
    ? await db.select<{ c: number }[]>(
        `SELECT COUNT(*) as c FROM petugas_akun WHERE tim_kasukretan_id = ? AND id != ?`,
        [timId, excludeId]
      )
    : await db.select<{ c: number }[]>(
        `SELECT COUNT(*) as c FROM petugas_akun WHERE tim_kasukretan_id = ?`,
        [timId]
      );
  if ((rows[0]?.c ?? 0) > 0) throw new Error("Anggota tim ini sudah punya akun login");
}

export async function createPetugasAkun(params: {
  username: string;
  password: string;
  tim_kasukretan_id: string;
  nama?: string;
}): Promise<PetugasAkunRecord> {
  const usernameErr = validateUsername(params.username);
  if (usernameErr) throw new Error(usernameErr);
  const passwordErr = validatePassword(params.password);
  if (passwordErr) throw new Error(passwordErr);

  const tim = await assertTimExists(params.tim_kasukretan_id);
  await assertUsernameFree(params.username.trim());
  await assertTimNotLinked(params.tim_kasukretan_id);

  const db = await getDb();
  const id = uuid();
  const hash = await bcrypt.hash(params.password, 10);
  const now = new Date().toISOString();
  const nama = params.nama?.trim() || tim.nama;

  await db.execute(
    `INSERT INTO petugas_akun (
      id, username, password_hash, tim_kasukretan_id, nama, must_change_password, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, params.username.trim(), hash, params.tim_kasukretan_id, nama, now, now]
  );

  const created = await getPetugasAkunById(id);
  if (!created) throw new Error("Gagal membuat akun petugas");
  return created;
}

export async function updatePetugasAkun(
  id: string,
  params: {
    username?: string;
    tim_kasukretan_id?: string;
    nama?: string | null;
    aktif?: boolean;
  }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = ["updated_at = ?"];
  const args: unknown[] = [new Date().toISOString()];

  if (params.username != null) {
    const usernameErr = validateUsername(params.username);
    if (usernameErr) throw new Error(usernameErr);
    const trimmed = params.username.trim();
    await assertUsernameFree(trimmed, id);
    sets.push("username = ?");
    args.push(trimmed);
  }
  if (params.tim_kasukretan_id != null) {
    await assertTimExists(params.tim_kasukretan_id);
    await assertTimNotLinked(params.tim_kasukretan_id, id);
    sets.push("tim_kasukretan_id = ?");
    args.push(params.tim_kasukretan_id);
  }
  if (params.nama !== undefined) {
    sets.push("nama = ?");
    args.push(params.nama?.trim() || null);
  }
  if (params.aktif !== undefined) {
    sets.push("aktif = ?");
    args.push(params.aktif ? 1 : 0);
  }
  if (sets.length === 1) return;

  args.push(id);
  await db.execute(`UPDATE petugas_akun SET ${sets.join(", ")} WHERE id = ?`, args);
}

export async function setPetugasAkunPassword(
  id: string,
  password: string,
  opts?: { clearMustChange?: boolean }
): Promise<void> {
  const passwordErr = validatePassword(password);
  if (passwordErr) throw new Error(passwordErr);

  const db = await getDb();
  const hash = await bcrypt.hash(password, 10);
  const mustChange = opts?.clearMustChange === false ? 1 : 0;
  await db.execute(
    `UPDATE petugas_akun SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?`,
    [hash, mustChange, new Date().toISOString(), id]
  );
}

export async function collectPetugasAkunForSync() {
  const db = await getDb();
  return db.select<
    {
      id: string;
      username: string;
      password_hash: string;
      tim_kasukretan_id: string;
      nama: string | null;
      aktif: number;
      must_change_password: number;
    }[]
  >(
    `SELECT id, username, password_hash, tim_kasukretan_id, nama, aktif, must_change_password
     FROM petugas_akun`
  );
}
