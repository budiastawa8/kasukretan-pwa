import schemaSql from "./schema.sql?raw";
import Database from "../desktop/sql";
import { probeLanBridge } from "../lan-client";
import {
  ensureDudukanKeringananTable,
  markMigrationsApplied,
  resetInitPromise,
  setDbInstance,
} from "./client";
import { runMasterDataMigrations } from "./migrations";
import { seedDatabase } from "./seed";

let initPromise: Promise<void> | null = null;

async function initDatabaseInner(): Promise<void> {
  const db = await Database.load("sqlite:kasukretan.db");
  setDbInstance(db);

  const parts = schemaSql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of parts) {
    await db.execute(stmt);
  }
  await runMasterDataMigrations(db);
  await ensureDudukanKeringananTable(db);
  markMigrationsApplied();
  await seedDatabase();
}

/** Satu kali init per proses — hindari race saat React Strict Mode dev. */
export async function initDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = initDatabaseInner().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/** Klien LAN: pakai SQLite PC server (tanpa migrasi lokal). */
export async function initLanClientDatabase(): Promise<void> {
  const ok = await probeLanBridge(true);
  if (!ok) {
    throw new Error("Server LAN tidak siap (bridge SQLite).");
  }
  const db = await Database.load("sqlite:kasukretan.db");
  setDbInstance(db);
  markMigrationsApplied();
}

export function resetDatabaseInit(): void {
  initPromise = null;
  resetInitPromise();
}
