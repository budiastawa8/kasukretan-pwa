/**
 * Klien cloud: UI di browser/PWA → API Vercel (/api/*) → database Turso.
 * Setiap SQL diperiksa RBAC di server (server/policy.ts).
 */

import type { SessionUser } from "./services/auth";
import { normalizeStaffRole } from "./auth-roles";

const API_BASE = "/api";
const TOKEN_KEY = "kasukretan_token";
/** Fungsi serverless bisa butuh beberapa detik saat "bangun". */
const HEALTH_TIMEOUT_MS = 15000;

export type LanHealth = {
  ok: boolean;
  service?: string;
  bridge?: string;
  dbReady?: boolean;
};

let lanAvailable: boolean | null = null;
let probePromise: Promise<boolean> | null = null;

export function getLanToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setLanToken(token: string | null): void {
  clearSelectCache();
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearLanSession(): void {
  setLanToken(null);
}

/** True jika probe terakhir berhasil menjangkau API cloud. */
export function isLanClientMode(): boolean {
  return lanAvailable === true;
}

export async function probeLanBridge(force = false): Promise<boolean> {
  if (!force && lanAvailable != null) return lanAvailable;
  if (!force && probePromise) return probePromise;

  probePromise = (async () => {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(`${API_BASE}/health`, {
        method: "GET",
        signal: ctrl.signal,
        cache: "no-store",
      });
      window.clearTimeout(t);
      if (!res.ok) {
        lanAvailable = false;
        return false;
      }
      const data = (await res.json()) as LanHealth;
      lanAvailable = Boolean(data.ok && data.bridge === "sqlite" && data.dbReady !== false);
      return lanAvailable;
    } catch {
      lanAvailable = false;
      return false;
    } finally {
      probePromise = null;
    }
  })();

  return probePromise;
}

export const SESSION_EXPIRED_EVENT = "kasukretan:session-expired";

export async function lanFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getLanToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new Error("Tidak dapat terhubung ke server. Periksa koneksi internet.");
  }
  const refreshed = res.headers.get("X-Refresh-Token");
  if (refreshed) setLanToken(refreshed);

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || `Server error HTTP ${res.status}`);
  }
  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: string }).error)
        : `Server error HTTP ${res.status}`;
    if (res.status === 401 && token) {
      clearLanSession();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new Error(err);
  }
  return data as T;
}

type ApiUser = {
  id: string;
  username: string;
  peran: string;
  nama: string | null;
  mustChangePassword: boolean;
};

function toSessionUser(u: ApiUser): SessionUser {
  return {
    id: u.id,
    username: u.username,
    peran: normalizeStaffRole(u.peran) ?? u.peran,
    nama: u.nama,
    mustChangePassword: Boolean(u.mustChangePassword),
  };
}

export async function lanLogin(username: string, password: string): Promise<SessionUser | null> {
  try {
    const res = await lanFetch<{ ok: boolean; token: string; user: ApiUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok || !res.token || !res.user) return null;
    setLanToken(res.token);
    return toSessionUser(res.user);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/salah/i.test(msg)) return null;
    throw e;
  }
}

/** Verifikasi password tanpa mengganti sesi yang sedang aktif. */
export async function lanVerifyPassword(username: string, password: string): Promise<SessionUser | null> {
  try {
    const res = await lanFetch<{ ok: boolean; user: ApiUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    return res.ok && res.user ? toSessionUser(res.user) : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/salah/i.test(msg)) return null;
    throw e;
  }
}

export async function lanChangePassword(oldPassword: string, newPassword: string): Promise<SessionUser> {
  const res = await lanFetch<{ ok: boolean; token: string; user: ApiUser }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  setLanToken(res.token);
  return toSessionUser(res.user);
}

export async function lanLogout(): Promise<void> {
  if (!getLanToken()) return;
  try {
    await lanFetch("/auth/logout", { method: "POST", body: "{}" });
  } catch {
    /* ignore */
  } finally {
    clearLanSession();
  }
}

export async function lanSqlExecute(sql: string, bind: unknown[] = []): Promise<{ rowsAffected: number }> {
  return lanFetch("/sql/execute", {
    method: "POST",
    body: JSON.stringify({ sql, bind }),
  });
}

export async function lanSqlSelect<T>(sql: string, bind: unknown[] = []): Promise<T> {
  return lanFetch<T>("/sql/select", {
    method: "POST",
    body: JSON.stringify({ sql, bind }),
  });
}

/**
 * Satu halaman (mis. Dashboard) memanggil query besar yang sama berkali-kali; lewat
 * internet seluler itu berarti megabita yang sama diunduh ulang. Query identik dalam
 * jendela singkat memakai satu respons; setiap perintah tulis mengosongkan cache.
 */
const SELECT_CACHE_MS = 5_000;
const selectCache = new Map<string, { at: number; promise: Promise<unknown> }>();

export function clearSelectCache(): void {
  selectCache.clear();
}

function cachedSelect<T>(sql: string, bind: unknown[]): Promise<T> {
  const key = `${sql}\u0000${JSON.stringify(bind)}`;
  const now = Date.now();
  for (const [k, v] of selectCache) {
    if (now - v.at > SELECT_CACHE_MS) selectCache.delete(k);
  }
  let entry = selectCache.get(key);
  if (!entry) {
    const promise = lanSqlSelect<T>(sql, bind);
    entry = { at: now, promise };
    selectCache.set(key, entry);
    promise.catch(() => {
      if (selectCache.get(key)?.promise === promise) selectCache.delete(key);
    });
  }
  return entry.promise.then((rows) => structuredClone(rows) as T);
}

/** Database adapter HTTP — bentuk sama dengan desktop SQL IPC. */
export class LanDatabase {
  static async load(_dbPath?: string): Promise<LanDatabase> {
    const ok = await probeLanBridge(true);
    if (!ok) {
      throw new Error("Server tidak dapat dijangkau. Periksa koneksi internet lalu coba lagi.");
    }
    return new LanDatabase();
  }

  async execute(sql: string, bind?: unknown[]): Promise<{ rowsAffected: number }> {
    clearSelectCache();
    try {
      return await lanSqlExecute(sql, bind ?? []);
    } finally {
      clearSelectCache();
    }
  }

  async select<T>(sql: string, bind?: unknown[]): Promise<T> {
    return cachedSelect<T>(sql, bind ?? []);
  }

  async close(): Promise<void> {
    /* no-op — koneksi di server */
  }
}
