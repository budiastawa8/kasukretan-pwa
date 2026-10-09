/**
 * Uji alur restore (/api/admin/restore/*) terhadap server lokal yang sedang jalan.
 *   npx tsx scripts/smoke-restore.ts [http://localhost:3001] [password-admin]
 * Me-restore database server dengan salinannya sendiri + penanda uji, lalu membersihkannya.
 * JANGAN jalankan ke database produksi.
 */
import "./load-env.js";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bcrypt from "bcryptjs";
import { databaseConfig, rowsToObjects } from "../server/db.js";
import { SCHEMA_OBJECTS_SQL } from "../server/restore.js";
import { toJsonValue } from "../server/sql-convert.js";
import { insertOrder, openFile } from "./lib/db-tools.js";

const BASE = (process.argv[2] ?? "http://localhost:3001").replace(/\/$/, "") + "/api";
const ADMIN_PASSWORD = process.argv[3] ?? process.env.SMOKE_ADMIN_PASSWORD ?? "admin123";
let failures = 0;

async function call(path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(BASE + path, {
    method: opts.body !== undefined ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : ` → ${JSON.stringify(detail)}`}`);
}

async function login(username: string, password: string): Promise<string> {
  const r = await call("/auth/login", { body: { username, password } });
  if (r.status !== 200) throw new Error(`login ${username} gagal: ${JSON.stringify(r.data)}`);
  return r.data.token as string;
}

const sql = (token: string, kind: "select" | "execute", q: string, bind: unknown[] = []) =>
  call(`/sql/${kind}`, { token, body: { sql: q, bind } });

const dbUrl = databaseConfig().url;
if (!dbUrl.startsWith("file:")) {
  console.error("smoke-restore hanya untuk database lokal (TURSO_DATABASE_URL=file:...).");
  process.exit(1);
}

const admin = await login("admin", ADMIN_PASSWORD);
await sql(admin, "execute", `DELETE FROM user WHERE username = 'smoke_restore_op'`);
await sql(
  admin,
  "execute",
  `INSERT INTO user (id, username, password_hash, peran, nama, must_change_password) VALUES (?, ?, ?, 'operator', 'Uji', 0)`,
  [crypto.randomUUID(), "smoke_restore_op", await bcrypt.hash("Rahasia123", 10)]
);
const operator = await login("smoke_restore_op", "Rahasia123");

// Sumber restore: salinan database server + penanda yang belum ada di server.
const dir = mkdtempSync(join(tmpdir(), "kas-restore-"));
const sourcePath = join(dir, "source.db");
copyFileSync(resolve(dbUrl.slice("file:".length)), sourcePath);
const source = await openFile(sourcePath);
const marker = crypto.randomUUID();
await source.execute({ sql: `INSERT OR REPLACE INTO app_sync_meta (key, value) VALUES ('smoke_restore', ?)`, args: [marker] });

const objects = rowsToObjects(await source.execute(SCHEMA_OBJECTS_SQL)) as {
  type: string;
  name: string;
  sql: string;
}[];
const tables = objects.filter((o) => o.type === "table");

check(
  "operator tidak bisa restore",
  (await call("/admin/restore/begin", { token: operator, body: { password: "Rahasia123", tables } })).status === 403
);
const wrong = await call("/admin/restore/begin", { token: admin, body: { password: "salah", tables } });
check("password salah ditolak", wrong.status === 400, wrong);
const bad = await call("/admin/restore/begin", {
  token: admin,
  body: { password: ADMIN_PASSWORD, tables: [{ type: "table", name: "x", sql: "DROP TABLE krama" }] },
});
check("SQL skema non-CREATE ditolak", bad.status === 400, bad);
check(
  "data tidak berubah setelah percobaan gagal",
  (await sql(operator, "execute", `UPDATE app_sync_meta SET value = value WHERE key = 'x'`)).status === 200
);

const begin = await call("/admin/restore/begin", { token: admin, body: { password: ADMIN_PASSWORD, tables } });
check("begin restore", begin.status === 200 && !!begin.data?.restoreId, begin);
const restoreId = begin.data?.restoreId as string;

const locked = await sql(operator, "execute", `UPDATE app_sync_meta SET value = value WHERE key = 'x'`);
check("operator diblokir selama restore (423)", locked.status === 423, locked);
check(
  "status restore terkunci",
  (await call("/admin/restore/status", { token: admin })).data?.locked === true
);
check(
  "restoreId salah ditolak",
  (await call("/admin/restore/rows", {
    token: admin,
    body: { restoreId: "x", table: "user", columns: ["id"], rows: [["a"]] },
  })).status === 409
);

let total = 0;
for (const table of await insertOrder(source, tables.map((t) => t.name))) {
  const rs = await source.execute(`SELECT * FROM "${table.replace(/"/g, '""')}"`);
  for (let i = 0; i < rs.rows.length; i += 200) {
    const rows = rs.rows.slice(i, i + 200).map((r) => rs.columns.map((_c, j) => toJsonValue(r[j])));
    const r = await call("/admin/restore/rows", {
      token: admin,
      body: { restoreId, table, columns: rs.columns, rows },
    });
    if (r.status !== 200) check(`rows ${table}`, false, r);
    total += rows.length;
  }
}
check(`kirim ${total} baris`, total > 0);

const version = Number((await source.execute("PRAGMA user_version")).rows[0]?.[0] ?? 0);
const finish = await call("/admin/restore/finish", {
  token: admin,
  body: { restoreId, objects: objects.filter((o) => o.type !== "table"), userVersion: version },
});
check("finish restore", finish.status === 200, finish);
check("end restore", (await call("/admin/restore/end", { token: admin, body: {} })).status === 200);

const after = await sql(admin, "select", `SELECT value FROM app_sync_meta WHERE key = 'smoke_restore'`);
check("data hasil restore terbaca", after.data?.[0]?.value === marker, after.data);
const unlocked = await sql(operator, "execute", `UPDATE app_sync_meta SET value = value WHERE key = 'x'`);
check("operator bisa menulis lagi setelah restore", unlocked.status === 200, unlocked);

await sql(admin, "execute", `DELETE FROM app_sync_meta WHERE key = 'smoke_restore'`);
await sql(admin, "execute", `DELETE FROM user WHERE username = 'smoke_restore_op'`);
source.close();
try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  // Windows kadang masih menahan berkas sesaat setelah ditutup; folder temp dibersihkan OS.
}

console.log(failures === 0 ? "\nSemua uji restore lulus." : `\n${failures} uji GAGAL.`);
process.exit(failures === 0 ? 0 : 1);
