/**
 * SQLite desktop via IPC better-sqlite3 (main process),
 * atau HTTP /lan/sql/* untuk klien browser di WiFi LAN.
 */

import { getElectronApi } from "../electron-bridge";
import { isLanClientMode, LanDatabase, probeLanBridge } from "../lan-client";

function requireSql() {
  const api = getElectronApi();
  if (!api?.sql) {
    throw new Error("Database SQLite hanya tersedia di aplikasi desktop Electron.");
  }
  return api.sql;
}

export default class Database {
  private constructor(
    private readonly dbKey: string,
    private readonly lan?: LanDatabase
  ) {}

  static async load(dbPath: string): Promise<Database> {
    const key = dbPath || "sqlite:kasukretan.db";
    const api = getElectronApi();
    if (api?.sql) {
      await api.sql.load(key);
      return new Database(key);
    }
    const lanOk = await probeLanBridge();
    if (lanOk) {
      const lan = await LanDatabase.load(key);
      return new Database(key, lan);
    }
    throw new Error(
      "Database SQLite hanya tersedia di aplikasi desktop Electron atau klien LAN."
    );
  }

  async execute(
    sql: string,
    bind?: unknown[]
  ): Promise<{ rowsAffected: number }> {
    if (this.lan) return this.lan.execute(sql, bind);
    return requireSql().execute(this.dbKey, sql, bind ?? []);
  }

  async select<T>(sql: string, bind?: unknown[]): Promise<T> {
    if (this.lan) return this.lan.select<T>(sql, bind);
    return (await requireSql().select(this.dbKey, sql, bind ?? [])) as T;
  }

  async close(_path?: string): Promise<void> {
    if (this.lan) {
      await this.lan.close();
      return;
    }
    await requireSql().close(this.dbKey);
  }
}

export { isLanClientMode, probeLanBridge };
