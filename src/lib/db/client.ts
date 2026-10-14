import Database from "../desktop/sql";
import { isDesktopApp } from "../runtime";
import { isLanClientMode, probeLanBridge } from "../lan-client";
import { runMasterDataMigrations } from "./migrations";

export class DesktopOnlyError extends Error {
  constructor() {
    super("Server tidak dapat dijangkau. Periksa koneksi internet lalu muat ulang aplikasi.");
    this.name = "DesktopOnlyError";
  }
}

let dbInstance: Database | null = null;
let migrationsDone = false;
let dudukanTableEnsured = false;
let pragmasApplied = false;

export function setDbInstance(db: Database): void {
  dbInstance = db;
}

export async function ensureDudukanKeringananTable(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS dudukan_keringanan (
      id TEXT PRIMARY KEY,
      krama_id TEXT NOT NULL REFERENCES krama(id),
      tahun INTEGER NOT NULL,
      bulan INTEGER NOT NULL,
      jumlah REAL NOT NULL,
      tanggal TEXT NOT NULL,
      petugas_id TEXT REFERENCES tim_kasukretan(id),
      keterangan TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (krama_id, tahun, bulan)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_dudukan_keringanan_periode
      ON dudukan_keringanan (tahun, bulan, krama_id)
  `);
}

async function applySqlitePragmas(db: Database): Promise<void> {
  if (pragmasApplied) return;
  // Klien LAN: PRAGMA dijalankan di server saat desktop init — skip di sini.
  if (isLanClientMode()) {
    pragmasApplied = true;
    return;
  }
  await db.execute(`PRAGMA foreign_keys = ON`);
  await db.execute(`PRAGMA journal_mode = WAL`);
  await db.execute(`PRAGMA busy_timeout = 10000`);
  pragmasApplied = true;
}

export async function getDb(): Promise<Database> {
  if (!isDesktopApp() && !isLanClientMode()) {
    const lan = await probeLanBridge(true);
    if (!lan) throw new DesktopOnlyError();
    dbInstance = null;
  }
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:kasukretan.db");
  }
  await applySqlitePragmas(dbInstance);
  if (!dudukanTableEnsured) {
    if (!isLanClientMode()) {
      await ensureDudukanKeringananTable(dbInstance);
    }
    dudukanTableEnsured = true;
  }
  if (!migrationsDone) {
    if (!isLanClientMode()) {
      await runMasterDataMigrations(dbInstance);
    }
    migrationsDone = true;
  }
  return dbInstance;
}

export function markMigrationsApplied(): void {
  migrationsDone = true;
}

export function resetInitPromise(): void {
  migrationsDone = false;
  dudukanTableEnsured = false;
  pragmasApplied = false;
}

/** Tutup koneksi SQLite (wajib sebelum restore/replace berkas database). */
export async function closeDb(): Promise<void> {
  if (!dbInstance) return;
  await dbInstance.close("sqlite:kasukretan.db");
  dbInstance = null;
  migrationsDone = false;
  dudukanTableEnsured = false;
  pragmasApplied = false;
  const { resetDatabaseInit } = await import("./init");
  resetDatabaseInit();
  const { invalidateDesaAdatCache } = await import("../services/desa");
  invalidateDesaAdatCache();
}
