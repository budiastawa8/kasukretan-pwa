/**
 * RBAC di sisi server untuk SQL yang dikirim UI.
 *
 * UI tetap menjalankan logika bisnis (service yang sama dengan desktop), tetapi
 * setiap statement diperiksa di sini sebelum menyentuh database — menu yang
 * disembunyikan di UI tidak cukup karena siapa pun bisa memanggil API langsung.
 *
 * Aturan mengikuti src/lib/auth-roles.ts:
 * - admin    — semua
 * - operator — tulis data krama
 * - keuangan — tulis data krama + keuangan (paturunan, dudukan, buku kas)
 * - prajuru  — hanya baca
 * - petugas  — baca + catat/hapus pembayaran miliknya sendiri yang belum disetor
 *              (baris diperiksa di handler: petugas, banjar, status setor)
 * Tabel yang tidak terdaftar (master, pengguna, lembaga) hanya untuk admin.
 */

export type Role = "admin" | "operator" | "keuangan" | "prajuru" | "petugas";

export function normalizeRole(value: unknown): Role | null {
  const v = String(value ?? "");
  if (v === "viewer") return "prajuru";
  if (v === "admin" || v === "operator" || v === "keuangan" || v === "prajuru" || v === "petugas") {
    return v;
  }
  return null;
}

export const PETUGAS_PAYMENT_TABLES = new Set(["paturunan_pembayaran", "dudukan_pembayaran"]);

export type PetugasGuard = { verb: "insert" | "delete"; table: string };

const KRAMA_TABLES = new Set([
  "penduduk",
  "krama",
  "anggota_keluarga",
  "krama_riwayat_klasifikasi",
  "pemasih_perpanjangan_riwayat",
  "penomoran_kartu_counter",
  "penomoran_nrkt_counter",
  "penomoran_nrt_counter",
  "penomoran_skk_counter",
  "penomoran_skp_counter",
  "surat_keterangan_krama",
  "surat_keterangan_pindah",
]);

const KEUANGAN_TABLES = new Set([
  "paturunan_pembayaran",
  "paturunan_lunas_krama",
  "iuran_paturunan",
  "dudukan_pembayaran",
  "dudukan_keringanan",
  "kas_dudukan_alokasi",
  "surat_penagihan_dudukan",
  "penomoran_sp_counter",
  "akun_keuangan",
  "pos_biaya",
  "pos_pemasukan",
  "transaksi_pengeluaran",
  "transaksi_pengeluaran_pos",
  "transaksi_pemasukan",
  "transaksi_pemasukan_pos",
  "transaksi_transfer",
  "setoran",
]);

/** Penanda internal aplikasi (status migrasi/sinkron) — boleh ditulis peran apa pun yang bisa menulis. */
const SHARED_TABLES = new Set(["app_sync_meta"]);

/** Hapus permanen krama (operator) ikut membersihkan riwayat pembayarannya. */
const KRAMA_CASCADE_TABLES = new Set([
  "paturunan_pembayaran",
  "paturunan_lunas_krama",
  "dudukan_pembayaran",
  "dudukan_keringanan",
]);

/** Biaya administrasi Pemasih saat pendaftaran dicatat sebagai pemasukan. */
const OPERATOR_INSERT_TABLES = new Set(["transaksi_pemasukan", "transaksi_pemasukan_pos"]);

const READONLY_PRAGMAS = new Set([
  "table_info",
  "table_xinfo",
  "index_list",
  "index_info",
  "foreign_key_list",
  "user_version",
]);

export type WriteVerb = "insert" | "update" | "delete";

export type PolicyDecision =
  | { allow: true; ensureExists?: { type: string; name: string }; petugasGuard?: PetugasGuard }
  | { allow: false; reason: string };

/** Buang komentar dan isi string literal agar kata kunci di dalam data tidak terbaca sebagai SQL. */
export function stripSql(sql: string): string {
  let out = "";
  let i = 0;
  const s = String(sql);
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (c === "-" && next === "-") {
      const end = s.indexOf("\n", i);
      i = end === -1 ? s.length : end;
      out += " ";
      continue;
    }
    if (c === "/" && next === "*") {
      const end = s.indexOf("*/", i + 2);
      i = end === -1 ? s.length : end + 2;
      out += " ";
      continue;
    }
    if (c === "'") {
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (s[i] === "'") break;
        i++;
      }
      i++;
      out += "''";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function cleanIdent(raw: string): string {
  const unquoted = raw.replace(/^["`[]|["`\]]$/g, "");
  const parts = unquoted.split(".");
  return parts[parts.length - 1].replace(/^["`[]|["`\]]$/g, "").toLowerCase();
}

const WRITE_RE =
  /\b(INSERT\s+(?:OR\s+(?:REPLACE|IGNORE|ABORT|FAIL|ROLLBACK)\s+)?INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+(?:REPLACE|IGNORE|ABORT|FAIL|ROLLBACK))?|DELETE\s+FROM)\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|[\w.]+)/gi;

export function findWrites(stripped: string): { verb: WriteVerb; table: string }[] {
  const writes: { verb: WriteVerb; table: string }[] = [];
  for (const m of stripped.matchAll(WRITE_RE)) {
    const kw = m[1].toUpperCase();
    const table = cleanIdent(m[2]);
    // `ON CONFLICT ... DO UPDATE SET` — bagian dari INSERT, bukan UPDATE tabel lain.
    if (table === "set") continue;
    const verb: WriteVerb = kw.startsWith("DELETE")
      ? "delete"
      : kw.startsWith("UPDATE")
        ? "update"
        : "insert";
    writes.push({ verb, table });
  }
  return writes;
}

function canWrite(role: Role, verb: WriteVerb, table: string, stripped: string): boolean {
  if (role === "admin") return true;
  if (role === "prajuru") return false;
  if (SHARED_TABLES.has(table)) return true;
  if (role === "petugas") return false;

  if (KRAMA_TABLES.has(table)) {
    // Hapus krama/penduduk hanya admin & operator (canDeleteKrama).
    if (role === "keuangan" && verb === "delete" && ["krama", "penduduk", "anggota_keluarga"].includes(table)) {
      return false;
    }
    return true;
  }

  if (KEUANGAN_TABLES.has(table)) {
    if (role === "keuangan") return true;
    if (verb === "insert" && OPERATOR_INSERT_TABLES.has(table)) return true;
    if (
      verb === "delete" &&
      KRAMA_CASCADE_TABLES.has(table) &&
      /^\s*DELETE\s+FROM\s+\w+\s+WHERE\s+krama_id\s*=\s*(\?|\$\d+)\s*;?\s*$/i.test(stripped)
    ) {
      return true;
    }
    return false;
  }

  // Hapus transaksi IPMA melepas tautan di arsip surat (lihat services/pemasukan.ts).
  if (role === "keuangan" && verb === "update" && table === "surat_keterangan_mautsaha_adat") {
    return true;
  }

  return false;
}

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  operator: "Operator",
  keuangan: "Keuangan",
  prajuru: "Prajuru",
  petugas: "Petugas Lapangan",
};

const PETUGAS_DELETE_RE = /^\s*DELETE\s+FROM\s+(\w+)\s+WHERE\s+id\s*=\s*(\?|\$1)\s*;?\s*$/i;
const PETUGAS_INSERT_RE = /^\s*INSERT\s+INTO\s+(\w+)\s*\([^)]*\)\s*VALUES\s*\(/i;

/**
 * Petugas hanya boleh INSERT ... VALUES satu baris atau DELETE ... WHERE id = ? pada tabel
 * pembayaran; isi barisnya divalidasi handler sebelum commit.
 */
function petugasPaymentGuard(stripped: string): PetugasGuard | null {
  const del = stripped.match(PETUGAS_DELETE_RE);
  if (del && PETUGAS_PAYMENT_TABLES.has(del[1].toLowerCase())) {
    return { verb: "delete", table: del[1].toLowerCase() };
  }
  const ins = stripped.match(PETUGAS_INSERT_RE);
  if (ins && PETUGAS_PAYMENT_TABLES.has(ins[1].toLowerCase()) && !/\bSELECT\b/i.test(stripped)) {
    return { verb: "insert", table: ins[1].toLowerCase() };
  }
  return null;
}

function deny(role: Role, what: string): PolicyDecision {
  return { allow: false, reason: `Peran ${ROLE_LABEL[role]} tidak berhak ${what}.` };
}

export function authorizeSql(role: Role, sql: string): PolicyDecision {
  const stripped = stripSql(sql);
  const trimmed = stripped.trim();
  if (!trimmed) return { allow: false, reason: "SQL kosong" };

  if (/\b(ATTACH|DETACH)\b/i.test(trimmed) || /\bload_extension\s*\(/i.test(trimmed)) {
    return { allow: false, reason: "Perintah SQL ini tidak diizinkan." };
  }

  if (/;\s*\S/.test(trimmed) && role !== "admin") {
    return deny(role, "menjalankan beberapa perintah SQL sekaligus");
  }

  if (/\bpassword_hash\b/i.test(trimmed) && role !== "admin") {
    return deny(role, "mengakses data password");
  }

  const lead = (trimmed.match(/^\(*\s*(\w+)/)?.[1] ?? "").toUpperCase();

  if (lead === "PRAGMA") {
    const m = trimmed.match(/^PRAGMA\s+(?:\w+\.)?(\w+)\s*(=)?/i);
    const name = m?.[1]?.toLowerCase() ?? "";
    if (READONLY_PRAGMAS.has(name) && !m?.[2]) return { allow: true };
    return role === "admin" ? { allow: true } : deny(role, "mengubah pengaturan database");
  }

  if (lead === "CREATE") {
    if (role === "admin") return { allow: true };
    const m = trimmed.match(
      /^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER|VIEW)\s+IF\s+NOT\s+EXISTS\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|[\w.]+)/i
    );
    if (m) {
      return { allow: true, ensureExists: { type: m[1].toLowerCase(), name: cleanIdent(m[2]) } };
    }
    return deny(role, "mengubah struktur database");
  }

  const readLeads = new Set(["SELECT", "WITH", "VALUES", "EXPLAIN"]);
  const writeLeads = new Set(["INSERT", "UPDATE", "DELETE", "REPLACE"]);
  if (!readLeads.has(lead) && !writeLeads.has(lead)) {
    return role === "admin" ? { allow: true } : deny(role, "menjalankan perintah ini");
  }

  const writes = findWrites(trimmed);
  if (role === "petugas" && writes.some((w) => PETUGAS_PAYMENT_TABLES.has(w.table))) {
    const guard = writes.length === 1 ? petugasPaymentGuard(trimmed) : null;
    if (!guard) return deny(role, "mengubah data pembayaran dengan cara ini");
    return { allow: true, petugasGuard: guard };
  }

  for (const w of writes) {
    if (!canWrite(role, w.verb, w.table, trimmed)) {
      const aksi = w.verb === "insert" ? "menambah" : w.verb === "update" ? "mengubah" : "menghapus";
      return deny(role, `${aksi} data ${w.table}`);
    }
  }
  return { allow: true };
}
