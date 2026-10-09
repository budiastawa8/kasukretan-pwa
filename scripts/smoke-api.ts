/**
 * Uji cepat API + RBAC terhadap server yang sedang jalan.
 *   npm run dev:api   (terminal lain)
 *   npx tsx scripts/smoke-api.ts [http://localhost:3001]
 * Membuat user uji smoke_* di database target — jangan jalankan ke database produksi.
 */
import bcrypt from "bcryptjs";

const BASE = (process.argv[2] ?? "http://localhost:3001").replace(/\/$/, "") + "/api";
let failures = 0;

async function call(path: string, opts: { token?: string; body?: unknown; method?: string } = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
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

const health = await call("/health");
check("health", health.status === 200 && health.data.dbReady === true, health.data);

check("tanpa token → 401", (await sql("", "select", "SELECT 1")).status === 401);
check(
  "password salah → 401",
  (await call("/auth/login", { body: { username: "admin", password: "salah123" } })).status === 401
);

const admin = await login("admin", "admin123");
const pw = "Rahasia123";
const hash = await bcrypt.hash(pw, 10);
await sql(admin, "execute", `DELETE FROM user WHERE username LIKE 'smoke_%'`);
for (const peran of ["operator", "keuangan", "prajuru"]) {
  const r = await sql(
    admin,
    "execute",
    `INSERT INTO user (id, username, password_hash, peran, nama, must_change_password) VALUES ($1, $2, $3, $4, $5, 0)`,
    [crypto.randomUUID(), `smoke_${peran}`, hash, peran, `Uji ${peran}`]
  );
  check(`admin buat user ${peran}`, r.status === 200, r.data);
}

const operator = await login("smoke_operator", pw);
const keuangan = await login("smoke_keuangan", pw);
const prajuru = await login("smoke_prajuru", pw);

const denied = async (name: string, p: Promise<{ status: number; data: unknown }>) => {
  const r = await p;
  check(name, r.status === 403, r);
};
const notDenied = async (name: string, p: Promise<{ status: number; data: unknown }>) => {
  const r = await p;
  check(name, r.status !== 403 && r.status !== 401, r);
};

await notDenied("prajuru baca krama", sql(prajuru, "select", "SELECT * FROM krama LIMIT 1"));
await notDenied(
  "prajuru baca user tanpa hash",
  sql(prajuru, "select", "SELECT id, username, peran FROM user WHERE id = $1", ["x"])
);
await denied("prajuru ubah krama", sql(prajuru, "execute", "UPDATE krama SET alamat = 'x' WHERE id = $1", ["x"]));
await denied("prajuru baca password_hash", sql(prajuru, "select", "SELECT password_hash FROM user"));
await denied("prajuru multi-statement", sql(prajuru, "execute", "SELECT 1; DELETE FROM krama"));
await denied("prajuru PRAGMA tulis", sql(prajuru, "execute", "PRAGMA foreign_keys = OFF"));
await notDenied("prajuru PRAGMA table_info", sql(prajuru, "select", "PRAGMA table_info(krama)"));
await notDenied(
  "CREATE IF NOT EXISTS tabel yang ada = no-op",
  sql(prajuru, "execute", "CREATE TABLE IF NOT EXISTS app_sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
);
await denied("prajuru DROP", sql(prajuru, "execute", "DROP TABLE krama"));
await notDenied(
  "kata kunci dalam string tidak dianggap SQL",
  sql(prajuru, "select", "SELECT 'DELETE FROM krama' AS teks")
);

await notDenied(
  "operator ubah krama",
  sql(operator, "execute", "UPDATE krama SET alamat = alamat WHERE id = $1", ["x"])
);
await denied(
  "operator tulis pengeluaran",
  sql(operator, "execute", "UPDATE transaksi_pengeluaran SET keterangan = 'x' WHERE id = ?", ["x"])
);
await notDenied(
  "operator hapus pembayaran saat hapus krama",
  sql(operator, "execute", "DELETE FROM dudukan_pembayaran WHERE krama_id = $1", ["x"])
);
await denied(
  "operator hapus pembayaran lain",
  sql(operator, "execute", "DELETE FROM dudukan_pembayaran WHERE id = $1", ["x"])
);
await denied("operator ubah master banjar", sql(operator, "execute", "UPDATE banjar SET nama = 'x' WHERE id = ?", ["x"]));
await denied("operator ubah user", sql(operator, "execute", "UPDATE user SET peran = 'admin' WHERE id = ?", ["x"]));
await denied(
  "operator lewat subquery tetap dicek",
  sql(operator, "execute", "INSERT INTO user (id) SELECT id FROM krama")
);

await notDenied(
  "keuangan ubah pengeluaran",
  sql(keuangan, "execute", "UPDATE transaksi_pengeluaran SET keterangan = keterangan WHERE id = ?", ["x"])
);
await denied("keuangan hapus krama", sql(keuangan, "execute", "DELETE FROM krama WHERE id = ?", ["x"]));
await denied("keuangan ubah master", sql(keuangan, "execute", "UPDATE jenis_tamiu SET nama = 'x' WHERE id = ?", ["x"]));

await denied("non-admin backup", call("/admin/schema", { token: operator }));
const schema = await call("/admin/schema", { token: admin });
check("admin schema", schema.status === 200 && schema.data.objects.length > 10, schema.data);
const dump = await call("/admin/dump", { token: admin, body: { table: "klasifikasi_krama", offset: 0 } });
check("admin dump", dump.status === 200 && dump.data.rows.length === 3 && dump.data.nextOffset === null, dump.data);
const badDump = await call("/admin/dump", { token: admin, body: { table: "krama; DROP TABLE x", offset: 0 } });
check("dump nama tabel tidak valid", badDump.status === 404, badDump.data);

const changed = await call("/auth/change-password", {
  token: prajuru,
  body: { oldPassword: pw, newPassword: "BaruSekali99" },
});
check("ganti password sendiri", changed.status === 200 && typeof changed.data.token === "string", changed.data);
check("login password baru", (await call("/auth/login", { body: { username: "smoke_prajuru", password: "BaruSekali99" } })).status === 200);
const weak = await call("/auth/change-password", { token: prajuru, body: { oldPassword: "BaruSekali99", newPassword: "123" } });
check("tolak password lemah", weak.status === 400, weak.data);

const r = await sql(admin, "execute", `DELETE FROM user WHERE username LIKE 'smoke_%'`);
check("bersihkan user uji", r.status === 200 && r.data.rowsAffected === 3, r.data);

console.log(failures === 0 ? "\nSemua uji lulus." : `\n${failures} uji GAGAL.`);
process.exit(failures === 0 ? 0 : 1);
