/**
 * Restore berkas kasukretan.db (backup aplikasi atau database desktop) ke database cloud.
 * Berkas dibaca di browser dengan sql.js lalu dikirim bertahap ke /api/admin/restore/*
 * (batas body fungsi Vercel 4,5 MB per request).
 */

import type { Database as SqlJsDatabase, SqlValue } from "sql.js";
import { getDb } from "./db/client";
import { applySchemaMigrations } from "./db/init";
import { clearSelectCache, lanFetch } from "./lan-client";
import { invalidateDesaAdatCache } from "./services/desa";

type SchemaObject = { type: string; name: string; tbl_name: string; sql: string };

export type RestoreSummary = {
  fileName: string;
  fileSize: number;
  userVersion: number;
  tableCount: number;
  totalRows: number;
  krama: number;
  penduduk: number;
  users: number;
  adminUsernames: string[];
  desaNama: string | null;
};

/** `tableIndex` 0 = database sudah dikunci & dikosongkan, data belum dikirim. */
export type RestoreProgress = { table: string; tableIndex: number; tableCount: number; rows: number };

const REQUIRED_TABLES = ["user", "krama", "klasifikasi_krama"];
const CHUNK_MAX_CHARS = 2_500_000;
const CHUNK_MAX_ROWS = 500;

const SCHEMA_SQL = `SELECT type, name, tbl_name, sql FROM sqlite_master
  WHERE sql IS NOT NULL
    AND name NOT LIKE 'sqlite_%'
    AND name NOT LIKE '_litestream%'
    AND name NOT LIKE 'libsql_%'
    AND name <> 'kasukretan_restore_lock'
  ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`;

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function openSqlJs(bytes: Uint8Array): Promise<SqlJsDatabase> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm.wasm?url"),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return new SQL.Database(bytes);
}

function queryObjects(db: SqlJsDatabase, sql: string): Record<string, SqlValue>[] {
  const res = db.exec(sql)[0];
  if (!res) return [];
  return res.values.map((row) => Object.fromEntries(res.columns.map((c, i) => [c, row[i]])));
}

function scalar(db: SqlJsDatabase, sql: string): number {
  const v = db.exec(sql)[0]?.values[0]?.[0];
  return Number(v ?? 0);
}

function hasColumn(db: SqlJsDatabase, table: string, column: string): boolean {
  return queryObjects(db, `PRAGMA table_info(${q(table)})`).some((c) => c.name === column);
}

function schemaObjects(db: SqlJsDatabase): SchemaObject[] {
  return queryObjects(db, SCHEMA_SQL) as unknown as SchemaObject[];
}

const SQLITE_HEADER = "SQLite format 3\u0000";

/** Validasi berkas dan ringkasan isinya untuk ditampilkan sebelum restore. */
export async function inspectBackupFile(file: File): Promise<{ bytes: Uint8Array; summary: RestoreSummary }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 16));
  if (header !== SQLITE_HEADER) throw new Error("Berkas bukan database SQLite (.db).");

  const db = await openSqlJs(bytes);
  try {
    const integrity = db.exec("PRAGMA quick_check")[0]?.values[0]?.[0];
    if (integrity !== "ok") throw new Error("Berkas database rusak (quick_check gagal).");

    const objects = schemaObjects(db);
    const tables = objects.filter((o) => o.type === "table").map((o) => o.name);
    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      throw new Error(`Bukan database Kasukretan — tabel ${missing.join(", ")} tidak ditemukan.`);
    }

    const aktifFilter = hasColumn(db, "user", "aktif") ? "AND aktif = 1" : "";
    const adminUsernames = queryObjects(
      db,
      `SELECT username FROM user WHERE peran = 'admin' ${aktifFilter} ORDER BY username`
    ).map((r) => String(r.username));
    if (adminUsernames.length === 0) {
      throw new Error("Berkas tidak memiliki akun admin aktif — setelah restore tidak ada yang bisa masuk sebagai admin.");
    }

    let totalRows = 0;
    for (const t of tables) totalRows += scalar(db, `SELECT COUNT(*) FROM ${q(t)}`);

    let desaNama: string | null = null;
    if (tables.includes("desa_adat") && hasColumn(db, "desa_adat", "nama_desa_adat")) {
      const v = db.exec(`SELECT nama_desa_adat FROM desa_adat LIMIT 1`)[0]?.values[0]?.[0];
      desaNama = v ? String(v) : null;
    }

    return {
      bytes,
      summary: {
        fileName: file.name,
        fileSize: file.size,
        userVersion: scalar(db, "PRAGMA user_version"),
        tableCount: tables.length,
        totalRows,
        krama: scalar(db, "SELECT COUNT(*) FROM krama"),
        penduduk: tables.includes("penduduk") ? scalar(db, "SELECT COUNT(*) FROM penduduk") : 0,
        users: scalar(db, "SELECT COUNT(*) FROM user"),
        adminUsernames,
        desaNama,
      },
    };
  } finally {
    db.close();
  }
}

/** Tabel induk sebelum anak agar foreign key terpenuhi. */
function insertOrder(db: SqlJsDatabase, tables: string[]): string[] {
  const deps = new Map<string, string[]>();
  for (const t of tables) {
    const parents = queryObjects(db, `PRAGMA foreign_key_list(${q(t)})`)
      .map((r) => String(r.table))
      .filter((p) => p !== t && tables.includes(p));
    deps.set(t, parents);
  }
  const ordered: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (t: string) => {
    if (done.has(t) || visiting.has(t)) return;
    visiting.add(t);
    for (const p of deps.get(t) ?? []) visit(p);
    visiting.delete(t);
    done.add(t);
    ordered.push(t);
  };
  tables.forEach(visit);
  return ordered;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function encodeValue(v: SqlValue): unknown {
  return v instanceof Uint8Array ? { $blob: toBase64(v) } : v;
}

/**
 * Ganti seluruh database cloud dengan isi berkas. Database dikunci selama proses;
 * bila gagal di tengah, kunci tetap aktif sampai restore diulang atau dibatalkan.
 */
export async function runCloudRestore(
  bytes: Uint8Array,
  password: string,
  onProgress?: (p: RestoreProgress) => void
): Promise<void> {
  const db = await openSqlJs(bytes);
  try {
    const objects = schemaObjects(db);
    const tables = objects.filter((o) => o.type === "table");
    const post = <T>(path: string, body: unknown) =>
      lanFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

    const { restoreId } = await post<{ restoreId: string }>("/admin/restore/begin", {
      password,
      tables: tables.map(({ type, name, sql }) => ({ type, name, sql })),
    });

    const order = insertOrder(db, tables.map((t) => t.name));
    onProgress?.({ table: "", tableIndex: 0, tableCount: order.length, rows: 0 });
    for (const [i, table] of order.entries()) {
      const stmt = db.prepare(`SELECT * FROM ${q(table)}`);
      const columns = stmt.getColumnNames();
      let rows: unknown[][] = [];
      let chars = 0;
      let sent = 0;
      const flush = async () => {
        if (rows.length === 0) return;
        await post("/admin/restore/rows", { restoreId, table, columns, rows });
        sent += rows.length;
        rows = [];
        chars = 0;
        onProgress?.({ table, tableIndex: i + 1, tableCount: order.length, rows: sent });
      };
      try {
        while (stmt.step()) {
          const row = stmt.get().map(encodeValue);
          const size = JSON.stringify(row).length;
          if (rows.length > 0 && (chars + size > CHUNK_MAX_CHARS || rows.length >= CHUNK_MAX_ROWS)) {
            await flush();
          }
          rows.push(row);
          chars += size;
        }
        await flush();
      } finally {
        stmt.free();
      }
      onProgress?.({ table, tableIndex: i + 1, tableCount: order.length, rows: sent });
    }

    await post("/admin/restore/finish", {
      restoreId,
      objects: objects.filter((o) => o.type !== "table").map(({ type, name, sql }) => ({ type, name, sql })),
      userVersion: scalar(db, "PRAGMA user_version"),
    });

    await applySchemaMigrations(await getDb());
    await post("/admin/restore/end", {});
    clearSelectCache();
    invalidateDesaAdatCache();
  } finally {
    db.close();
  }
}

/** Lepas kunci restore yang gagal agar staf bisa kembali mengubah data. */
export async function cancelCloudRestore(): Promise<void> {
  await lanFetch("/admin/restore/end", { method: "POST", body: "{}" });
}
