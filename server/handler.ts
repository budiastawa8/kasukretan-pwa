import type { IncomingMessage, ServerResponse } from "node:http";
import {
  HttpError,
  changeOwnPassword,
  loginWithPassword,
  resolveSession,
  signToken,
  type PublicUser,
} from "./auth.js";
import { dbExecute, dbSelect, getClient, type DbTiming } from "./db.js";
import { executePetugasPaymentWrite } from "./petugas-guard.js";
import { authorizeSql, type PetugasGuard } from "./policy.js";
import {
  SCHEMA_OBJECTS_SQL,
  assertNotLocked,
  beginRestore,
  endRestore,
  finishRestore,
  holdsRestoreLock,
  restoreRows,
  restoreStatus,
} from "./restore.js";
import { toJsonValue } from "./sql-convert.js";

type ApiRequest = IncomingMessage & { body?: unknown };

/** Batas aman di bawah limit respons fungsi Vercel (4,5 MB). */
const DUMP_MAX_BYTES = 3 * 1024 * 1024;
const DUMP_PAGE_ROWS = 200;

function send(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

async function readBody(req: ApiRequest): Promise<Record<string, unknown>> {
  if (req.body !== undefined) {
    if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString("utf8")) : {};
    return (req.body ?? {}) as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function routePath(req: ApiRequest): string {
  const url = new URL(req.url ?? "/", "http://localhost");
  const fromQuery = url.searchParams.get("path");
  const raw = fromQuery ?? url.pathname.replace(/^\/api\/?/, "");
  return raw.replace(/^\/+|\/+$/g, "");
}

async function requireUser(req: ApiRequest, res: ServerResponse): Promise<PublicUser> {
  const header = String(req.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = token ? await resolveSession(token) : null;
  if (!session) throw new HttpError(401, "Sesi berakhir. Silakan masuk ulang.");
  if (session.refreshedToken) res.setHeader("X-Refresh-Token", session.refreshedToken);
  return session.user;
}

function requireAdmin(user: PublicUser): void {
  if (user.peran !== "admin") throw new HttpError(403, "Hanya administrator.");
}

async function objectExists(type: string, name: string): Promise<boolean> {
  const rows = await dbSelect(`SELECT 1 AS ok FROM sqlite_master WHERE type = ? AND lower(name) = ?`, [
    type,
    name.toLowerCase(),
  ]);
  return rows.length > 0;
}

async function authorizeOrThrow(
  user: PublicUser,
  sql: string
): Promise<"run" | "noop" | { guard: PetugasGuard }> {
  const decision = authorizeSql(user.peran, sql);
  if (!decision.allow) throw new HttpError(403, decision.reason);
  if (decision.ensureExists) {
    if (await objectExists(decision.ensureExists.type, decision.ensureExists.name)) return "noop";
    throw new HttpError(403, "Struktur database belum lengkap. Minta admin menjalankan npm run db:init.");
  }
  if (decision.petugasGuard) return { guard: decision.petugasGuard };
  return "run";
}

function sqlFromBody(body: Record<string, unknown>): { sql: string; bind: unknown[] } {
  const sql = String(body.sql ?? "");
  if (!sql.trim()) throw new HttpError(400, "SQL kosong");
  return { sql, bind: Array.isArray(body.bind) ? body.bind : [] };
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function handleRoute(path: string, req: ApiRequest, res: ServerResponse): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();

  if (path === "health" && method === "GET") {
    let dbReady = false;
    let dbError: string | undefined;
    try {
      await dbSelect("SELECT 1 AS ok");
      dbReady = true;
    } catch (err) {
      console.error("[health] database:", err);
      dbError = (err instanceof Error ? err.message : String(err)).replace(/eyJ[\w.-]+/g, "***");
    }
    send(res, 200, { ok: true, service: "kasukretan-pwa", bridge: "sqlite", dbReady, dbError });
    return;
  }

  if (path === "auth/login" && method === "POST") {
    const body = await readBody(req);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !password) throw new HttpError(400, "Username dan password wajib.");
    const user = await loginWithPassword(username, password);
    if (!user) throw new HttpError(401, "Username atau password salah");
    send(res, 200, { ok: true, token: signToken(user), user });
    return;
  }

  if (path === "auth/logout" && method === "POST") {
    send(res, 200, { ok: true });
    return;
  }

  const user = await requireUser(req, res);

  if (path === "auth/me" && method === "GET") {
    send(res, 200, { ok: true, user });
    return;
  }

  if (path === "auth/change-password" && method === "POST") {
    const body = await readBody(req);
    const fresh = await changeOwnPassword(
      user.id,
      String(body.oldPassword ?? ""),
      String(body.newPassword ?? "")
    );
    send(res, 200, { ok: true, token: signToken(fresh), user: fresh });
    return;
  }

  if (path === "sql/select" && method === "POST") {
    const { sql, bind } = sqlFromBody(await readBody(req));
    const auth = await authorizeOrThrow(user, sql);
    if (auth === "noop") {
      send(res, 200, []);
      return;
    }
    if (auth !== "run") throw new HttpError(403, "Perintah tulis tidak boleh lewat sql/select.");
    const timing: DbTiming = { ms: 0, attempts: 0 };
    const rows = await dbSelect(sql, bind, timing);
    res.setHeader("Server-Timing", `db;dur=${timing.ms};desc="${timing.attempts}x"`);
    send(res, 200, rows);
    return;
  }

  if (path === "sql/execute" && method === "POST") {
    const { sql, bind } = sqlFromBody(await readBody(req));
    const auth = await authorizeOrThrow(user, sql);
    if (auth === "noop") {
      send(res, 200, { rowsAffected: 0 });
      return;
    }
    await assertNotLocked(user);
    if (auth !== "run") {
      send(res, 200, await executePetugasPaymentWrite(user, auth.guard, sql, bind));
      return;
    }
    send(res, 200, await dbExecute(sql, bind));
    return;
  }

  if (path === "admin/restore/status" && method === "GET") {
    requireAdmin(user);
    send(res, 200, { ok: true, ...(await restoreStatus()) });
    return;
  }

  if (path === "admin/restore/begin" && method === "POST") {
    requireAdmin(user);
    const body = await readBody(req);
    const verified =
      (await holdsRestoreLock(user)) ||
      (await loginWithPassword(user.username, String(body.password ?? "")).catch(() => null));
    if (!verified) {
      throw new HttpError(400, "Password admin salah.");
    }
    const restoreId = await beginRestore(user, body.tables);
    // Tabel user ikut diganti — token baru menunda cek ulang sesi ke database sampai restore selesai.
    res.setHeader("X-Refresh-Token", signToken(user));
    send(res, 200, { ok: true, restoreId });
    return;
  }

  if (path === "admin/restore/rows" && method === "POST") {
    requireAdmin(user);
    send(res, 200, { ok: true, inserted: await restoreRows(user, await readBody(req)) });
    return;
  }

  if (path === "admin/restore/finish" && method === "POST") {
    requireAdmin(user);
    await finishRestore(user, await readBody(req));
    send(res, 200, { ok: true });
    return;
  }

  if (path === "admin/restore/end" && method === "POST") {
    requireAdmin(user);
    await endRestore(user);
    send(res, 200, { ok: true });
    return;
  }

  if (path === "admin/schema" && method === "GET") {
    requireAdmin(user);
    const objects = await dbSelect(
      `${SCHEMA_OBJECTS_SQL}
       ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`
    );
    const version = await dbSelect(`PRAGMA user_version`);
    send(res, 200, { ok: true, userVersion: Number(version[0]?.user_version ?? 0), objects });
    return;
  }

  if (path === "admin/dump" && method === "POST") {
    requireAdmin(user);
    const body = await readBody(req);
    const table = String(body.table ?? "");
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    if (!(await objectExists("table", table))) throw new HttpError(404, `Tabel ${table} tidak ada`);

    const client = await getClient();
    const rs = await client.execute({
      sql: `SELECT * FROM ${quoteIdent(table)} LIMIT ? OFFSET ?`,
      args: [DUMP_PAGE_ROWS, offset],
    });
    const rows: unknown[][] = [];
    let bytes = 0;
    for (const row of rs.rows) {
      const values = rs.columns.map((_c, i) => toJsonValue(row[i]));
      const size = JSON.stringify(values).length;
      if (rows.length > 0 && bytes + size > DUMP_MAX_BYTES) break;
      rows.push(values);
      bytes += size;
    }
    const done = rows.length === rs.rows.length && rs.rows.length < DUMP_PAGE_ROWS;
    send(res, 200, {
      ok: true,
      columns: rs.columns,
      rows,
      nextOffset: done ? null : offset + rows.length,
    });
    return;
  }

  throw new HttpError(404, `Endpoint tidak ditemukan: ${method} /api/${path}`);
}

export async function handleApi(req: ApiRequest, res: ServerResponse): Promise<void> {
  const path = routePath(req);
  try {
    await handleRoute(path, req, res);
  } catch (err) {
    if (err instanceof HttpError) {
      send(res, err.status, { ok: false, error: err.message });
      return;
    }
    if (err instanceof SyntaxError) {
      send(res, 400, { ok: false, error: "Body JSON tidak valid" });
      return;
    }
    console.error(`[api] ${req.method} /api/${path}:`, err);
    send(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
