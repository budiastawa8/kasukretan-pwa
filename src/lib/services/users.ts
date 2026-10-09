import bcrypt from "bcryptjs";
import { getDb } from "../db/client";
import { validatePassword, validateUsername } from "../auth-password";
import type { StaffRole } from "../auth-roles";
import { normalizeStaffRole } from "../auth-roles";
import { uuid } from "../utils";
import { isLanClientMode, lanChangePassword } from "../lan-client";

export type UserRecord = {
  id: string;
  username: string;
  peran: StaffRole;
  nama: string | null;
  aktif: number;
  must_change_password: number;
  created_at: string;
};

type UserDbRow = {
  id: string;
  username: string;
  password_hash: string;
  peran: string;
  nama: string | null;
  aktif: number;
  must_change_password?: number;
  created_at: string;
};

function mapUser(row: UserDbRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    peran: normalizeStaffRole(row.peran) ?? (row.peran as StaffRole),
    nama: row.nama,
    aktif: row.aktif,
    must_change_password: row.must_change_password ?? 0,
    created_at: row.created_at,
  };
}

export async function listUsers(): Promise<UserRecord[]> {
  const db = await getDb();
  const rows = await db.select<UserDbRow[]>(
    `SELECT id, username, peran, nama, aktif, must_change_password, created_at
     FROM user ORDER BY username COLLATE NOCASE`
  );
  return rows.map(mapUser);
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const db = await getDb();
  const rows = await db.select<UserDbRow[]>(
    `SELECT id, username, peran, nama, aktif, must_change_password, created_at
     FROM user WHERE id = ?`,
    [id]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

async function assertUsernameFree(username: string, excludeId?: string): Promise<void> {
  const db = await getDb();
  const rows = excludeId
    ? await db.select<{ c: number }[]>(
        `SELECT COUNT(*) as c FROM user WHERE lower(username) = lower(?) AND id != ?`,
        [username, excludeId]
      )
    : await db.select<{ c: number }[]>(
        `SELECT COUNT(*) as c FROM user WHERE lower(username) = lower(?)`,
        [username]
      );
  if ((rows[0]?.c ?? 0) > 0) throw new Error("Username sudah dipakai");
}

export async function createUser(params: {
  username: string;
  password: string;
  peran: StaffRole;
  nama?: string;
  mustChangePassword?: boolean;
}): Promise<UserRecord> {
  const usernameErr = validateUsername(params.username);
  if (usernameErr) throw new Error(usernameErr);
  const passwordErr = validatePassword(params.password);
  if (passwordErr) throw new Error(passwordErr);

  const db = await getDb();
  await assertUsernameFree(params.username.trim());

  const id = uuid();
  const hash = await bcrypt.hash(params.password, 10);
  const mustChange = params.mustChangePassword ? 1 : 0;
  await db.execute(
    `INSERT INTO user (id, username, password_hash, peran, nama, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, params.username.trim(), hash, params.peran, params.nama?.trim() || null, mustChange]
  );
  const created = await getUserById(id);
  if (!created) throw new Error("Gagal membuat pengguna");
  return created;
}

export async function updateUser(
  id: string,
  params: {
    username?: string;
    peran?: StaffRole;
    nama?: string | null;
    aktif?: boolean;
  }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const args: unknown[] = [];

  if (params.username != null) {
    const usernameErr = validateUsername(params.username);
    if (usernameErr) throw new Error(usernameErr);
    const trimmed = params.username.trim();
    await assertUsernameFree(trimmed, id);
    sets.push("username = ?");
    args.push(trimmed);
  }
  if (params.peran != null) {
    sets.push("peran = ?");
    args.push(params.peran);
  }
  if (params.nama !== undefined) {
    sets.push("nama = ?");
    args.push(params.nama?.trim() || null);
  }
  if (params.aktif !== undefined) {
    sets.push("aktif = ?");
    args.push(params.aktif ? 1 : 0);
  }
  if (sets.length === 0) return;

  args.push(id);
  await db.execute(`UPDATE user SET ${sets.join(", ")} WHERE id = ?`, args);
}

export async function setUserPassword(
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
    `UPDATE user SET password_hash = ?, must_change_password = ? WHERE id = ?`,
    [hash, mustChange, id]
  );
}

export async function changeOwnPassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  if (isLanClientMode()) {
    await lanChangePassword(oldPassword, newPassword);
    return;
  }
  const db = await getDb();
  const rows = await db.select<{ password_hash: string }[]>(
    `SELECT password_hash FROM user WHERE id = ? AND aktif = 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) throw new Error("Pengguna tidak ditemukan");

  const ok = await bcrypt.compare(oldPassword, row.password_hash);
  if (!ok) throw new Error("Password lama salah");

  await setUserPassword(userId, newPassword, { clearMustChange: true });
}

export async function countActiveAdmins(excludeId?: string): Promise<number> {
  const db = await getDb();
  const rows = excludeId
    ? await db.select<{ c: number }[]>(
        `SELECT COUNT(*) as c FROM user WHERE peran = 'admin' AND aktif = 1 AND id != ?`,
        [excludeId]
      )
    : await db.select<{ c: number }[]>(
        `SELECT COUNT(*) as c FROM user WHERE peran = 'admin' AND aktif = 1`
      );
  return rows[0]?.c ?? 0;
}
