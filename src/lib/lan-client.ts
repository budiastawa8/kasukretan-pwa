/**
 * Klien cloud: UI di browser/PWA → API Vercel (/api/*) → database Turso.
 * Setiap SQL diperiksa RBAC di server (server/policy.ts).
 */

import type { SessionUser } from "./services/auth";
import { normalizeStaffRole } from "./auth-roles";
import { clearSelectPersist, readSelectPersist, writeSelectPersist } from "./select-persist";

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

export async function lanSqlSelectBatch(queries: { sql: string; bind: unknown[] }[]): Promise<unknown[]> {
  if (queries.length === 0) return [];
  if (queries.length === 1) {
    return [await lanSqlSelect(queries[0].sql, queries[0].bind)];
  }
  const res = await lanFetch<{ results: unknown[] }>("/sql/select-batch", {
    method: "POST",
    body: JSON.stringify({ queries }),
  });
  return res.results;
}

/**
 * Query identik dalam jendela singkat memakai satu respons; Promise.all digabung
 * jadi satu HTTP batch. Hasil disimpan (sessionStorage / IndexedDB) agar buka ulang
 * cepat (stale-while-revalidate). Setiap perintah tulis mengosongkan cache.
 */
const SELECT_FRESH_MS = 20_000;
const SELECT_PERSIST_MS = 5 * 60_000;

const selectCache = new Map<string, { at: number; promise: Promise<unknown> }>();

type PendingSelect = {
  key: string;
  sql: string;
  bind: unknown[];
  resolve: (rows: unknown) => void;
  reject: (err: unknown) => void;
};

let pendingBatch: PendingSelect[] | null = null;
let batchFlushScheduled = false;

function selectCacheKey(sql: string, bind: unknown[]): string {
  return `${sql}\u0000${JSON.stringify(bind)}`;
}

export function clearSelectCache(): void {
  selectCache.clear();
  clearSelectPersist();
  if (pendingBatch?.length) {
    const abandoned = pendingBatch;
    pendingBatch = null;
    batchFlushScheduled = false;
    for (const item of abandoned) {
      item.reject(new Error("Cache SELECT dikosongkan"));
    }
  } else {
    pendingBatch = null;
    batchFlushScheduled = false;
  }
}

function pruneFreshCache(now: number): void {
  for (const [k, v] of selectCache) {
    if (now - v.at > SELECT_FRESH_MS) selectCache.delete(k);
  }
}

async function flushSelectBatch(): Promise<void> {
  const batch = pendingBatch;
  pendingBatch = null;
  batchFlushScheduled = false;
  if (!batch?.length) return;

  /** Dedup query identik dalam batch yang sama. */
  const uniqueOrder: { key: string; sql: string; bind: unknown[] }[] = [];
  const keyToIndex = new Map<string, number>();
  for (const item of batch) {
    if (!keyToIndex.has(item.key)) {
      keyToIndex.set(item.key, uniqueOrder.length);
      uniqueOrder.push({ key: item.key, sql: item.sql, bind: item.bind });
    }
  }

  try {
    const results = await lanSqlSelectBatch(
      uniqueOrder.map((q) => ({ sql: q.sql, bind: q.bind }))
    );
    await Promise.all(
      uniqueOrder.map((q, i) => writeSelectPersist(q.key, results[i]))
    );
    for (const item of batch) {
      const idx = keyToIndex.get(item.key)!;
      item.resolve(results[idx]);
    }
  } catch (err) {
    for (const item of batch) item.reject(err);
  }
}

function scheduleSelectNetwork(key: string, sql: string, bind: unknown[]): Promise<unknown> {
  const promise = new Promise<unknown>((resolve, reject) => {
    if (!pendingBatch) pendingBatch = [];
    pendingBatch.push({ key, sql, bind, resolve, reject });
    if (!batchFlushScheduled) {
      batchFlushScheduled = true;
      queueMicrotask(() => {
        void flushSelectBatch();
      });
    }
  });
  const entry = { at: Date.now(), promise };
  selectCache.set(key, entry);
  promise.catch(() => {
    if (selectCache.get(key)?.promise === promise) selectCache.delete(key);
  });
  return promise;
}

function cachedSelect<T>(sql: string, bind: unknown[]): Promise<T> {
  const key = selectCacheKey(sql, bind);
  const now = Date.now();
  pruneFreshCache(now);

  const hit = selectCache.get(key);
  if (hit && now - hit.at <= SELECT_FRESH_MS) {
    return hit.promise.then((rows) => structuredClone(rows) as T);
  }

  const network = scheduleSelectNetwork(key, sql, bind);

  return (async () => {
    const persisted = await readSelectPersist(key);
    if (persisted && Date.now() - persisted.at <= SELECT_PERSIST_MS) {
      /* Tampilkan cache dulu; network memperbarui untuk kunjungan berikutnya. */
      return structuredClone(persisted.rows) as T;
    }
    return structuredClone(await network) as T;
  })();
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
