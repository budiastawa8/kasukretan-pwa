/**
 * Snapshot ringkasan di SQLite/Turso — dibaca ulang antar klien dalam TTL,
 * mengurangi agregasi berulang (dashboard / laporan eksekutif).
 */
import { getDb } from "../db/client";

const DEFAULT_TTL_MS = 5 * 60_000;

export async function ensureRingkasanCacheTable(): Promise<void> {
  const db = await getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ringkasan_cache (
      kunci TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export async function readRingkasanCache<T>(
  kunci: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<T | null> {
  try {
    const db = await getDb();
    const rows = await db.select<{ payload: string; updated_at: string }[]>(
      `SELECT payload, updated_at FROM ringkasan_cache WHERE kunci = $1 LIMIT 1`,
      [kunci]
    );
    const row = rows[0];
    if (!row?.payload) return null;
    const updated = Date.parse(
      /[TzZ]|[+-]\d{2}/.test(row.updated_at) ? row.updated_at : `${row.updated_at.replace(" ", "T")}Z`
    );
    if (!Number.isFinite(updated) || Date.now() - updated > ttlMs) return null;
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function writeRingkasanCache(kunci: string, payload: unknown): Promise<void> {
  try {
    await ensureRingkasanCacheTable();
    const db = await getDb();
    const json = JSON.stringify(payload);
    await db.execute(
      `INSERT INTO ringkasan_cache (kunci, payload, updated_at)
       VALUES ($1, $2, datetime('now'))
       ON CONFLICT(kunci) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      [kunci, json]
    );
  } catch {
    /* cache gagal tidak boleh gagalkan halaman */
  }
}

export async function clearRingkasanCache(prefix?: string): Promise<void> {
  try {
    await ensureRingkasanCacheTable();
    const db = await getDb();
    if (prefix) {
      await db.execute(`DELETE FROM ringkasan_cache WHERE kunci LIKE $1`, [`${prefix}%`]);
    } else {
      await db.execute(`DELETE FROM ringkasan_cache`);
    }
  } catch {
    /* ignore */
  }
}
