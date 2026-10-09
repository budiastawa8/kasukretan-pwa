import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { validatePassword } from "../src/lib/auth-password.js";
import { dbExecute, dbSelect } from "./db.js";
import { normalizeRole, type Role } from "./policy.js";

/** Sesi berakhir jika tidak dipakai selama ini (token diperbarui otomatis saat aktif). */
const SESSION_IDLE_SEC = 7 * 24 * 60 * 60;
/** Interval cek ulang user (aktif/peran) ke database. */
const REVALIDATE_SEC = 60 * 60;

export type TokenPayload = {
  sub: string;
  username: string;
  peran: Role;
  nama: string | null;
  mcp: boolean;
  iat: number;
  exp: number;
};

export type PublicUser = {
  id: string;
  username: string;
  peran: Role;
  nama: string | null;
  mustChangePassword: boolean;
};

function secret(): Buffer {
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET belum di-set atau kurang dari 32 karakter (npm run jwt:secret).");
  }
  return Buffer.from(s, "utf8");
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signToken(user: PublicUser): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
    username: user.username,
    peran: user.peran,
    nama: user.nama,
    mcp: user.mustChangePassword,
    iat: now,
    exp: now + SESSION_IDLE_SEC,
  };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = createHmac("sha256", secret()).update(`${head}.${body}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.sub || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const peran = normalizeRole(payload.peran);
    if (!peran) return null;
    return { ...payload, peran };
  } catch {
    return null;
  }
}

export function payloadToUser(p: TokenPayload): PublicUser {
  return { id: p.sub, username: p.username, peran: p.peran, nama: p.nama, mustChangePassword: p.mcp };
}

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  peran: string;
  nama: string | null;
  must_change_password: number | null;
};

function rowToUser(row: Omit<UserRow, "password_hash">): PublicUser | null {
  const peran = normalizeRole(row.peran);
  if (!peran) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    peran,
    nama: row.nama != null ? String(row.nama) : null,
    mustChangePassword: Number(row.must_change_password ?? 0) === 1,
  };
}

export async function loginWithPassword(username: string, password: string): Promise<PublicUser | null> {
  const rows = (await dbSelect(
    `SELECT id, username, password_hash, peran, nama, must_change_password
     FROM user WHERE username = ? AND aktif = 1`,
    [username]
  )) as UserRow[];
  const row = rows[0];
  if (!row) {
    // Samakan waktu respons agar keberadaan username tidak bisa ditebak.
    await bcrypt.compare(password, "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.4mY7n4H4Y5r5Yp4bQ3G3tq6F2y1u");
    return null;
  }
  const ok = await bcrypt.compare(password, String(row.password_hash));
  return ok ? rowToUser(row) : null;
}

export async function loadActiveUser(id: string): Promise<PublicUser | null> {
  const rows = (await dbSelect(
    `SELECT id, username, peran, nama, must_change_password FROM user WHERE id = ? AND aktif = 1`,
    [id]
  )) as Omit<UserRow, "password_hash">[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

/**
 * Sesi valid → user terbaru + token baru bila perlu diperbarui.
 * Cek ulang ke database tiap jam agar user nonaktif / ganti peran cepat berlaku.
 */
export async function resolveSession(
  token: string
): Promise<{ user: PublicUser; refreshedToken: string | null } | null> {
  const payload = verifyToken(token);
  if (!payload) return null;
  const now = Math.floor(Date.now() / 1000);
  if (now - payload.iat < REVALIDATE_SEC) {
    return { user: payloadToUser(payload), refreshedToken: null };
  }
  const fresh = await loadActiveUser(payload.sub);
  if (!fresh) return null;
  return { user: fresh, refreshedToken: signToken(fresh) };
}

export async function changeOwnPassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<PublicUser> {
  const invalid = validatePassword(newPassword);
  if (invalid) throw new HttpError(400, invalid);
  const rows = (await dbSelect(`SELECT password_hash FROM user WHERE id = ? AND aktif = 1`, [userId])) as {
    password_hash: string;
  }[];
  const row = rows[0];
  if (!row) throw new HttpError(404, "Pengguna tidak ditemukan");
  if (!(await bcrypt.compare(oldPassword, String(row.password_hash)))) {
    throw new HttpError(400, "Password lama salah");
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await dbExecute(`UPDATE user SET password_hash = ?, must_change_password = 0 WHERE id = ?`, [hash, userId]);
  const fresh = await loadActiveUser(userId);
  if (!fresh) throw new HttpError(404, "Pengguna tidak ditemukan");
  return fresh;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
