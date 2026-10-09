/**
 * Backup database cloud → berkas kasukretan.db (SQLite) di browser.
 * Data diambil bertahap (admin/dump) lalu dirakit dengan sql.js, sehingga hasilnya
 * bisa dibuka atau di-restore di aplikasi desktop Kasukretan.
 */

import { lanFetch } from "./lan-client";
import { today } from "./utils";

type SchemaObject = { type: string; name: string; tbl_name: string; sql: string };
type DumpChunk = { columns: string[]; rows: unknown[][]; nextOffset: number | null };
type BlobJson = { $blob: string };

export type BackupProgress = { table: string; tableIndex: number; tableCount: number; rows: number };

function decodeValue(v: unknown): string | number | Uint8Array | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && typeof (v as BlobJson).$blob === "string") {
    const bin = atob((v as BlobJson).$blob);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (typeof v === "number" || typeof v === "string") return v;
  return String(v);
}

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function buildCloudBackup(
  onProgress?: (p: BackupProgress) => void
): Promise<{ bytes: Uint8Array; rows: number }> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm.wasm?url"),
  ]);
  const schema = await lanFetch<{ userVersion: number; objects: SchemaObject[] }>("/admin/schema");
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();

  try {
    const tables = schema.objects.filter((o) => o.type === "table");
    for (const t of tables) db.run(t.sql);

    let total = 0;
    for (const [i, t] of tables.entries()) {
      let offset: number | null = 0;
      let tableRows = 0;
      while (offset !== null) {
        const chunk: DumpChunk = await lanFetch<DumpChunk>("/admin/dump", {
          method: "POST",
          body: JSON.stringify({ table: t.name, offset }),
        });
        if (chunk.rows.length > 0) {
          const cols = chunk.columns.map(q).join(", ");
          const marks = chunk.columns.map(() => "?").join(", ");
          const stmt = db.prepare(`INSERT INTO ${q(t.name)} (${cols}) VALUES (${marks})`);
          db.run("BEGIN");
          for (const row of chunk.rows) stmt.run(row.map(decodeValue));
          db.run("COMMIT");
          stmt.free();
          tableRows += chunk.rows.length;
        }
        onProgress?.({ table: t.name, tableIndex: i + 1, tableCount: tables.length, rows: tableRows });
        offset = chunk.nextOffset;
      }
      total += tableRows;
    }

    for (const o of schema.objects.filter((x) => x.type !== "table")) db.run(o.sql);
    if (schema.userVersion > 0) db.run(`PRAGMA user_version = ${Math.trunc(schema.userVersion)}`);

    return { bytes: db.export(), rows: total };
  } finally {
    db.close();
  }
}

export function backupFileName(): string {
  return `kasukretan-backup-${today()}.db`;
}

export function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
