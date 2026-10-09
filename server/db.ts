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

export async function dbSelect(sql: string, bind?: unknown[]): Promise<Record<string, unknown>[]> {
  const client = await getClient();
  const { sql: converted, args } = convertSql(sql, bind);
  return rowsToObjects(await client.execute({ sql: converted, args }));
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
