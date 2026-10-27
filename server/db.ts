import type { Client, Config, ResultSet } from "@libsql/client";
import { convertSql, isMultiStatement, toJsonValue } from "./sql-convert.js";

let clientPromise: Promise<Client> | null = null;

export function databaseConfig(): Config {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL belum di-set (lihat .env.example). Untuk lokal: file:./data/kasukretan.db"
    );
  }
  return { url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined };
}

/**
 * URL `file:` butuh driver native (lokal/skrip); URL remote memakai klien HTTP
 * murni agar fungsi Vercel tidak membawa binary native.
 */
export async function createDbClient(config: Config): Promise<Client> {
  if (config.url.startsWith("file:")) {
    const { createClient } = await import("@libsql/client");
    return createClient(config);
  }
  const { createClient } = await import("@libsql/client/web");
  return createClient(config);
}

export function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = createDbClient(databaseConfig()).catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export function rowsToObjects(rs: ResultSet): Record<string, unknown>[] {
  return rs.rows.map((row) => {
    const out: Record<string, unknown> = {};
    rs.columns.forEach((col, i) => {
      out[col] = toJsonValue(row[i]);
    });
    return out;
  });
}

/** Query baca yang melewati batas ini dikirim ulang sekali; query tulis tidak boleh diulang (bisa tercatat dua kali). */
const SELECT_TIMEOUT_MS = 6_000;
const SLOW_QUERY_LOG_MS = 2_000;

const READ_ONLY_RE = /^\s*(SELECT|WITH)\b/i;
const WRITE_KEYWORD_RE = /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;

export type DbTiming = { ms: number; attempts: number };

class QueryTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new QueryTimeoutError(`Query > ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function dbSelect(
  sql: string,
  bind?: unknown[],
  timing?: DbTiming
): Promise<Record<string, unknown>[]> {
  const client = await withTimeout(getClient(), SELECT_TIMEOUT_MS);
  const { sql: converted, args } = convertSql(sql, bind);
  const retryable = READ_ONLY_RE.test(converted) && !WRITE_KEYWORD_RE.test(converted);
  const start = Date.now();
  let attempts = 0;
  try {
    for (;;) {
      attempts++;
      try {
        // Selalu pakai timeout — retry tanpa batas waktu bisa menggantung fungsi Vercel.
        const rs = await withTimeout(client.execute({ sql: converted, args }), SELECT_TIMEOUT_MS);
        return rowsToObjects(rs);
      } catch (err) {
        if (!(err instanceof QueryTimeoutError) || !retryable || attempts >= 2) throw err;
      }
    }
  } finally {
    const ms = Date.now() - start;
    if (timing) {
      timing.ms += ms;
      timing.attempts += attempts;
    }
    if (ms >= SLOW_QUERY_LOG_MS || attempts > 1) {
      console.warn(
        `[db] lambat ${ms} ms (percobaan ${attempts}): ${converted.replace(/\s+/g, " ").slice(0, 120)}`
      );
    }
  }
}

export async function dbExecute(sql: string, bind?: unknown[]): Promise<{ rowsAffected: number }> {
  const client = await getClient();
  const { sql: converted, args } = convertSql(sql, bind);
  if (!converted.trim()) return { rowsAffected: 0 };
  if (isMultiStatement(converted, args.length)) {
    await client.executeMultiple(converted);
    return { rowsAffected: 0 };
  }
  const rs = await client.execute({ sql: converted, args });
  return { rowsAffected: rs.rowsAffected };
}
