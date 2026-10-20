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

  // Tim Bantuan (toggle desa + tipe anggota)
  await ensureColumn("desa_adat", "tim_bantuan_aktif", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("tim_kasukretan", "tipe", "TEXT NOT NULL DEFAULT 'banjar'");

  // Pencarian cepat nomor kartu
  await ensureColumn("krama", "nomor_kartu_norm", "TEXT");
  await dbExecute(
    `UPDATE krama SET nomor_kartu_norm = lower(replace(nomor_kartu, '-', ''))
     WHERE nomor_kartu_norm IS NULL OR nomor_kartu_norm = ''
        OR nomor_kartu_norm <> lower(replace(nomor_kartu, '-', ''))`
  );
  await dbExecute(
    `CREATE INDEX IF NOT EXISTS idx_krama_nomor_kartu_norm ON krama (nomor_kartu_norm)`
  );
  await dbExecute(
    `CREATE INDEX IF NOT EXISTS idx_krama_status_banjar ON krama (status_krama, banjar_id)`
  );
  await dbExecute(
    `CREATE INDEX IF NOT EXISTS idx_krama_kepala ON krama (kepala_penduduk_id)`
  );
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
