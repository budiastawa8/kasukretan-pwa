import bcrypt from "bcryptjs";
import { getDb } from "../db/client";
import { normalizeStaffRole } from "../auth-roles";
import { isDesktopApp } from "../runtime";
import { isLanClientMode, lanLogin, lanVerifyPassword, probeLanBridge } from "../lan-client";

export const SESSION_USER_KEY = "kasukretan_user";

export interface SessionUser {
  id: string;
  username: string;
  peran: string;
  nama?: string | null;
  mustChangePassword?: boolean;
}

type UserLoginRow = {
  id: string;
  username: string;
  password_hash: string;
  peran: string;
  nama: string | null;
  must_change_password?: number;
};

export async function login(
  username: string,
  password: string
): Promise<SessionUser | null> {
  if (!isDesktopApp()) {
    const lan = isLanClientMode() || (await probeLanBridge());
    if (lan) return lanLogin(username, password);
  }

  const db = await getDb();
  const rows = await db.select<UserLoginRow[]>(
    `SELECT id, username, password_hash, peran, nama, must_change_password
     FROM user WHERE username = ? AND aktif = 1`,
    [username]
  );
  const user = rows[0];
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return {
    id: user.id,
    username: user.username,
    peran: normalizeStaffRole(user.peran) ?? user.peran,
    nama: user.nama,
    mustChangePassword: (user.must_change_password ?? 0) === 1,
  };
}

/** Muat ulang sesi dari database (validasi user masih aktif). */
export async function refreshSessionUser(userId: string): Promise<SessionUser | null> {
  const db = await getDb();
  const rows = await db.select<
    { id: string; username: string; peran: string; nama: string | null; must_change_password?: number }[]
  >(
    `SELECT id, username, peran, nama, must_change_password FROM user WHERE id = ? AND aktif = 1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    peran: normalizeStaffRole(user.peran) ?? user.peran,
    nama: user.nama,
    mustChangePassword: (user.must_change_password ?? 0) === 1,
  };
}

/** Verifikasi ulang password untuk tindakan sensitif (hanya admin). */
export async function verifyAdminPassword(
  username: string,
  password: string
): Promise<boolean> {
  const user = isLanClientMode()
    ? await lanVerifyPassword(username, password)
    : await login(username, password);
  return normalizeStaffRole(user?.peran) === "admin";
}

/** Sesi login tersimpan (untuk PDF/cetak). */
export function readStoredSessionUser(): SessionUser | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(SESSION_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function sessionUserDisplayName(user: SessionUser | null | undefined): string {
  return user?.nama?.trim() || user?.username?.trim() || "—";
}
