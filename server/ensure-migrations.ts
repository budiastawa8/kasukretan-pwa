/**
 * Migrasi skema untuk database cloud (Turso).
 * Klien PWA melewati migrasi lokal — kolom baru harus ditambahkan di sisi API.
 */

import { dbExecute, dbSelect } from "./db.js";

let ensurePromise: Promise<void> | null = null;

async function tableHasColumn(table: string, column: string): Promise<boolean> {
  const rows = await dbSelect(`PRAGMA table_info(${table})`);
  return rows.some((r) => String(r.name) === column);
}

async function ensureColumn(table: string, column: string, ddl: string): Promise<void> {
  if (await tableHasColumn(table, column)) return;
  await dbExecute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

async function runEnsureMigrations(): Promise<void> {
  // Pengingat setoran: kontak WhatsApp Tim Kasukretan
  await ensureColumn("tim_kasukretan", "nomor_kontak", "TEXT");
}

/** Idempoten; aman dipanggil tiap request (hanya sekali benar-benar jalan per cold start). */
export function ensureServerMigrations(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = runEnsureMigrations().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}
