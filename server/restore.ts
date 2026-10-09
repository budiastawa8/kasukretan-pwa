/**
 * Restore database cloud dari berkas kasukretan.db yang dikirim browser admin secara bertahap.
 *
 * Turso via HTTP tidak bisa membungkus banyak request dalam satu transaksi, jadi selama
 * restore database dikunci (tabel RESTORE_LOCK_TABLE): perubahan data dari pengguna lain
 * ditolak sampai admin menyelesaikan atau membatalkan restore.
 */
import { randomUUID } from "node:crypto";
import type { InStatement } from "@libsql/client";
import { HttpError, type PublicUser } from "./auth.js";
import { getClient, rowsToObjects } from "./db.js";
import { stripSql } from "./policy.js";
import { normalizeBindValue } from "./sql-convert.js";

export const RESTORE_LOCK_TABLE = "kasukretan_restore_lock";

/** Kunci yang tertinggal (browser ditutup di tengah restore) dianggap kedaluwarsa. */
const LOCK_TTL_MS = 30 * 60 * 1000;

export const SCHEMA_OBJECTS_SQL = `SELECT type, name, tbl_name, sql FROM sqlite_master
  WHERE sql IS NOT NULL
    AND name NOT LIKE 'sqlite_%'
    AND name NOT LIKE '_litestream%'
    AND name NOT LIKE 'libsql_%'
    AND name <> '${RESTORE_LOCK_TABLE}'`;

type SchemaObject = { type: string; name: string; sql: string };
type LockRow = { restore_id: string; user_id: string; username: string; started_at: string };

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function readLock(includeExpired = false): Promise<LockRow | null> {
  const client = await getClient();
  try {
    const rs = await client.execute(
      `SELECT restore_id, user_id, username, started_at FROM ${RESTORE_LOCK_TABLE} WHERE id = 1`
    );
    const row = rowsToObjects(rs)[0] as LockRow | undefined;
    if (!row) return null;
    if (!includeExpired && Date.now() - Date.parse(row.started_at) > LOCK_TTL_MS) return null;
    return row;
  } catch {
    // Tabel kunci belum pernah dibuat → tidak ada restore berjalan.
    return null;
  }
}

/**
 * Restore yang gagal di tengah bisa menyisakan tabel user kosong sehingga password tidak bisa
 * dicek — admin pemegang kunci boleh mengulang restore tanpa verifikasi ulang.
 */
export async function holdsRestoreLock(user: PublicUser): Promise<boolean> {
  const lock = await readLock(true);
  return !!lock && lock.user_id === user.id;
}

/** Dipanggil sebelum perubahan data: tolak bila admin lain sedang me-restore. */
export async function assertNotLocked(user: PublicUser): Promise<void> {
  const lock = await readLock();
  if (lock && lock.user_id !== user.id) {
    throw new HttpError(
      423,
      `Database sedang di-restore oleh ${lock.username}. Perubahan data ditunda — coba lagi beberapa menit lagi.`
    );
  }
}

async function requireLock(user: PublicUser, restoreId: unknown): Promise<void> {
  const lock = await readLock();
  if (!lock || lock.restore_id !== String(restoreId ?? "") || lock.user_id !== user.id) {
    throw new HttpError(409, "Sesi restore tidak aktif atau sudah kedaluwarsa. Ulangi restore dari awal.");
  }
}

/** Hanya DDL `CREATE <type>` biasa yang boleh dibuat ulang dari berkas backup. */
function assertCreateSql(obj: SchemaObject): void {
  const type = String(obj.type ?? "").toLowerCase();
  const sql = String(obj.sql ?? "");
  const stripped = stripSql(sql).trim();
  const pattern =
    type === "table"
      ? /^CREATE\s+TABLE\b/i
      : type === "index"
        ? /^CREATE\s+(UNIQUE\s+)?INDEX\b/i
        : type === "trigger"
          ? /^CREATE\s+TRIGGER\b/i
          : type === "view"
            ? /^CREATE\s+VIEW\b/i
            : null;
  if (
    !pattern ||
    !pattern.test(stripped) ||
    /\b(ATTACH|DETACH)\b/i.test(stripped) ||
    /\bload_extension\s*\(/i.test(stripped) ||
    String(obj.name ?? "").toLowerCase() === RESTORE_LOCK_TABLE
  ) {
    throw new HttpError(400, `Objek skema tidak valid di berkas backup: ${obj.name}`);
  }
}

function parseObjects(value: unknown): SchemaObject[] {
  if (!Array.isArray(value)) throw new HttpError(400, "Daftar skema tidak valid");
  return value.map((o) => {
    const obj = o as SchemaObject;
    assertCreateSql(obj);
    return { type: String(obj.type).toLowerCase(), name: String(obj.name), sql: String(obj.sql) };
  });
}

/** Kunci database, hapus seluruh isi, lalu buat tabel sesuai berkas backup. */
export async function beginRestore(user: PublicUser, tablesValue: unknown): Promise<string> {
  const tables = parseObjects(tablesValue);
  if (!tables.every((t) => t.type === "table")) throw new HttpError(400, "Tahap awal hanya membuat tabel");
  const names = new Set(tables.map((t) => t.name.toLowerCase()));
  for (const required of ["user", "krama", "klasifikasi_krama"]) {
    if (!names.has(required)) throw new HttpError(400, `Berkas backup tidak memiliki tabel ${required}.`);
  }

  const client = await getClient();
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${RESTORE_LOCK_TABLE} (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       restore_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       username TEXT NOT NULL,
       started_at TEXT NOT NULL
     )`
  );
  const existing = await readLock();
  if (existing && existing.user_id !== user.id) {
    throw new HttpError(409, `Restore lain sedang berjalan oleh ${existing.username}.`);
  }
  const restoreId = randomUUID();
  await client.execute({
    sql: `INSERT OR REPLACE INTO ${RESTORE_LOCK_TABLE} (id, restore_id, user_id, username, started_at)
          VALUES (1, ?, ?, ?, ?)`,
    args: [restoreId, user.id, user.username, new Date().toISOString()],
  });

  const current = rowsToObjects(await client.execute(SCHEMA_OBJECTS_SQL)) as SchemaObject[];
  const drops = [
    ...current.filter((o) => o.type === "view").map((o) => `DROP VIEW IF EXISTS ${q(o.name)}`),
    ...current.filter((o) => o.type === "trigger").map((o) => `DROP TRIGGER IF EXISTS ${q(o.name)}`),
    ...current.filter((o) => o.type === "table").map((o) => `DROP TABLE IF EXISTS ${q(o.name)}`),
  ];
  if (drops.length > 0) {
    await client.executeMultiple(`PRAGMA foreign_keys = OFF;\n${drops.join(";\n")};\nPRAGMA foreign_keys = ON;`);
  }
  for (const t of tables) await client.execute(t.sql);
  return restoreId;
}

export async function restoreRows(user: PublicUser, body: Record<string, unknown>): Promise<number> {
  await requireLock(user, body.restoreId);
  const table = String(body.table ?? "");
  const columns = Array.isArray(body.columns) ? body.columns.map(String) : [];
  const rows = Array.isArray(body.rows) ? (body.rows as unknown[][]) : [];
  if (!table || columns.length === 0) throw new HttpError(400, "Tabel/kolom kosong");
  if (rows.length === 0) return 0;

  const client = await getClient();
  const exists = await client.execute({
    sql: `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
    args: [table],
  });
  if (exists.rows.length === 0) throw new HttpError(404, `Tabel ${table} tidak ada`);

  const insertSql = `INSERT INTO ${q(table)} (${columns.map(q).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  const stmts: InStatement[] = rows.map((row) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new HttpError(400, `Baris tidak valid pada tabel ${table}`);
    }
    return { sql: insertSql, args: row.map(normalizeBindValue) };
  });
  await client.batch(["PRAGMA defer_foreign_keys = ON", ...stmts], "write");
  return rows.length;
}

/** Index/trigger/view + user_version setelah semua data masuk. Kunci tetap aktif sampai endRestore. */
export async function finishRestore(user: PublicUser, body: Record<string, unknown>): Promise<void> {
  await requireLock(user, body.restoreId);
  const objects = parseObjects(body.objects);
  const client = await getClient();
  for (const o of objects.filter((x) => x.type !== "table")) await client.execute(o.sql);
  const version = Math.trunc(Number(body.userVersion ?? 0));
  if (Number.isFinite(version) && version > 0) await client.execute(`PRAGMA user_version = ${version}`);
}

/** Lepas kunci — setelah restore selesai, atau untuk membatalkan restore yang gagal. */
export async function endRestore(user: PublicUser): Promise<void> {
  const lock = await readLock();
  if (lock && lock.user_id !== user.id) {
    throw new HttpError(409, `Restore sedang berjalan oleh ${lock.username}.`);
  }
  const client = await getClient();
  try {
    await client.execute(`DELETE FROM ${RESTORE_LOCK_TABLE}`);
  } catch {
    // tabel kunci belum ada
  }
}

export async function restoreStatus(): Promise<{ locked: boolean; username: string | null; startedAt: string | null }> {
  const lock = await readLock();
  return { locked: !!lock, username: lock?.username ?? null, startedAt: lock?.started_at ?? null };
}
