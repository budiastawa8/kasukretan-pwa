import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Client, InStatement } from "@libsql/client";
import { createDbClient, databaseConfig, rowsToObjects } from "../../server/db.js";
import { convertSql, isMultiStatement } from "../../server/sql-convert.js";
import type Database from "../../src/lib/desktop/sql.js";
import { runMasterDataMigrations } from "../../src/lib/db/migrations.js";
import { seedDatabaseAfterWipe } from "../../src/lib/db/seed.js";

export function fileUrl(path: string): string {
  return `file:${resolve(path).replace(/\\/g, "/")}`;
}

export async function openTarget(): Promise<{ client: Client; url: string }> {
  const config = databaseConfig();
  if (config.url.startsWith("file:")) {
    mkdirSync(dirname(resolve(config.url.slice("file:".length))), { recursive: true });
  }
  return { client: await createDbClient(config), url: config.url };
}

export async function openFile(path: string): Promise<Client> {
  return createDbClient({ url: fileUrl(path) });
}

/** Adapter berbentuk `Database` desktop agar migrasi & seed bawaan bisa dipakai ulang. */
export function asAppDatabase(client: Client): Database {
  const adapter = {
    async execute(sql: string, bind?: unknown[]) {
      const { sql: s, args } = convertSql(sql, bind);
      if (isMultiStatement(s, args.length)) {
        await client.executeMultiple(s);
        return { rowsAffected: 0 };
      }
      const rs = await client.execute({ sql: s, args });
      return { rowsAffected: rs.rowsAffected };
    },
    async select<T>(sql: string, bind?: unknown[]) {
      const { sql: s, args } = convertSql(sql, bind);
      return rowsToObjects(await client.execute({ sql: s, args })) as T;
    },
    async close() {},
  };
  return adapter as unknown as Database;
}

/** Skema terbaru + migrasi idempoten (sama dengan desktop) + seed bila kosong. */
export async function initSchema(client: Client, log = console.log): Promise<void> {
  const db = asAppDatabase(client);
  const schemaSql = readFileSync(resolve("src/lib/db/schema.sql"), "utf8");
  const statements = schemaSql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) await db.execute(stmt);
  log(`[db] skema: ${statements.length} statement`);

  await runMasterDataMigrations(db);
  log("[db] migrasi selesai");

  const rows = await db.select<{ c: number }[]>(`SELECT COUNT(*) AS c FROM klasifikasi_krama`);
  if (Number(rows[0]?.c ?? 0) === 0) {
    await seedDatabaseAfterWipe(db);
    log("[db] seed awal: user admin / admin123 (wajib ganti saat login pertama)");
  }
}

type SchemaObject = { type: string; name: string; tbl_name: string; sql: string };

export async function listObjects(client: Client): Promise<SchemaObject[]> {
  const rs = await client.execute(
    `SELECT type, name, tbl_name, sql FROM sqlite_master
     WHERE sql IS NOT NULL
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE '_litestream%'
       AND name NOT LIKE 'libsql_%'`
  );
  return rowsToObjects(rs) as SchemaObject[];
}

export async function countUserRows(client: Client): Promise<number> {
  let total = 0;
  for (const t of (await listObjects(client)).filter((o) => o.type === "table")) {
    const rs = await client.execute(`SELECT COUNT(*) AS c FROM ${q(t.name)}`);
    total += Number(rs.rows[0]?.[0] ?? 0);
  }
  return total;
}

export async function dropAll(client: Client): Promise<void> {
  const objects = await listObjects(client);
  const stmts = [
    ...objects.filter((o) => o.type === "view").map((o) => `DROP VIEW IF EXISTS ${q(o.name)}`),
    ...objects.filter((o) => o.type === "trigger").map((o) => `DROP TRIGGER IF EXISTS ${q(o.name)}`),
    ...objects.filter((o) => o.type === "table").map((o) => `DROP TABLE IF EXISTS ${q(o.name)}`),
  ];
  if (stmts.length === 0) return;
  await client.executeMultiple(`PRAGMA foreign_keys = OFF;\n${stmts.join(";\n")};\nPRAGMA foreign_keys = ON;`);
}

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Urutkan tabel induk sebelum anak (foreign key) agar insert tidak melanggar relasi. */
async function insertOrder(client: Client, tables: string[]): Promise<string[]> {
  const deps = new Map<string, Set<string>>();
  for (const t of tables) {
    const rs = await client.execute(`PRAGMA foreign_key_list(${q(t)})`);
    const parents = new Set<string>();
    for (const row of rowsToObjects(rs)) {
      const parent = String(row.table ?? "");
      if (parent && parent !== t && tables.includes(parent)) parents.add(parent);
    }
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

const PAGE_ROWS = 200;
const BATCH_MAX_BYTES = 2 * 1024 * 1024;

/** Salin seluruh skema + data dari `src` ke `dst` (dst harus kosong). */
export async function copyDatabase(src: Client, dst: Client, log = console.log): Promise<void> {
  const objects = await listObjects(src);
  const tables = objects.filter((o) => o.type === "table");

  for (const t of tables) await dst.execute(t.sql);

  for (const table of await insertOrder(src, tables.map((t) => t.name))) {
    let offset = 0;
    let copied = 0;
    for (;;) {
      const rs = await src.execute({
        sql: `SELECT * FROM ${q(table)} LIMIT ? OFFSET ?`,
        args: [PAGE_ROWS, offset],
      });
      if (rs.rows.length === 0) break;
      const cols = rs.columns.map(q).join(", ");
      const marks = rs.columns.map(() => "?").join(", ");
      const insertSql = `INSERT INTO ${q(table)} (${cols}) VALUES (${marks})`;

      let batch: InStatement[] = [];
      let bytes = 0;
      const flush = async () => {
        if (batch.length === 0) return;
        await dst.batch(["PRAGMA defer_foreign_keys = ON", ...batch], "write");
        batch = [];
        bytes = 0;
      };
      for (const row of rs.rows) {
        const args = rs.columns.map((_c, i) => row[i]);
        batch.push({ sql: insertSql, args });
        bytes += args.reduce<number>(
          (n, v) => n + (typeof v === "string" ? v.length : v instanceof ArrayBuffer ? v.byteLength : 8),
          0
        );
        if (bytes > BATCH_MAX_BYTES) await flush();
      }
      await flush();

      copied += rs.rows.length;
      offset += rs.rows.length;
      if (rs.rows.length < PAGE_ROWS) break;
    }
    log(`[db] ${table}: ${copied} baris`);
  }

  for (const o of objects.filter((x) => x.type !== "table")) {
    await dst.execute(o.sql);
  }

  const version = await src.execute(`PRAGMA user_version`);
  const userVersion = Number(version.rows[0]?.[0] ?? 0);
  if (userVersion > 0) await dst.execute(`PRAGMA user_version = ${userVersion}`);
}
