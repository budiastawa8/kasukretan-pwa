import { getDb } from "../db/client";

export async function ensureSyncMetaTable(): Promise<void> {
  const db = await getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

export async function getSyncMeta(key: string): Promise<string | null> {
  await ensureSyncMetaTable();
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = ?`,
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await ensureSyncMetaTable();
  const db = await getDb();
  await db.execute(`INSERT OR REPLACE INTO app_sync_meta (key, value) VALUES (?, ?)`, [
    key,
    value,
  ]);
}
