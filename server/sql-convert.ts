/**
 * Kode UI memakai bind gaya `$1, $2` (warisan plugin-sql) dan `?`.
 * Di SQLite `$1` adalah parameter bernama, jadi diubah ke `?` berurutan
 * (nomor boleh dipakai ulang) — sama seperti bridge desktop.
 */

export type SqlValue = null | string | number | bigint | boolean | Uint8Array;

export type BlobJson = { $blob: string };

function isBlobJson(v: unknown): v is BlobJson {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as BlobJson).$blob === "string" &&
    Object.keys(v).length === 1
  );
}

export function normalizeBindValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string" || typeof v === "bigint") return v;
  if (v instanceof Uint8Array) return v;
  if (isBlobJson(v)) return Uint8Array.from(Buffer.from(v.$blob, "base64"));
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
}

export function convertSql(sql: string, bind: unknown[] = []): { sql: string; args: SqlValue[] } {
  const src = String(sql);
  const bindArr = Array.isArray(bind) ? bind : [];
  if (!/\$\d+/.test(src)) {
    return { sql: src, args: bindArr.map(normalizeBindValue) };
  }
  const args: SqlValue[] = [];
  const converted = src.replace(/\$(\d+)/g, (_m, n: string) => {
    const idx = Number(n) - 1;
    args.push(idx >= 0 && idx < bindArr.length ? normalizeBindValue(bindArr[idx]) : null);
    return "?";
  });
  return { sql: converted, args };
}

/** Nilai hasil query → aman untuk JSON (BigInt → number, BLOB → base64). */
export function toJsonValue(v: unknown): unknown {
  if (typeof v === "bigint") {
    return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(v)
      : v.toString();
  }
  if (v instanceof ArrayBuffer) return { $blob: Buffer.from(v).toString("base64") };
  if (v instanceof Uint8Array) return { $blob: Buffer.from(v).toString("base64") };
  return v;
}

/** Satu string berisi beberapa statement (tanpa bind) — dieksekusi sebagai skrip. */
export function isMultiStatement(sql: string, argCount: number): boolean {
  return argCount === 0 && /;\s*\S/.test(sql.trim());
}
