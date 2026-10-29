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

  // Kartu tanda pengenal Tim Kasukretan
  await ensureColumn("tim_kasukretan", "nomor_pengenal", "TEXT");
  await ensureColumn("tim_kasukretan", "foto_url", "TEXT");
  await ensureColumn("tim_kasukretan", "aktif", "INTEGER NOT NULL DEFAULT 1");
  // Normalisasi string kosong → NULL agar UNIQUE index aman
  await dbExecute(
    `UPDATE tim_kasukretan SET nomor_pengenal = NULL
     WHERE nomor_pengenal IS NOT NULL AND trim(nomor_pengenal) = ''`
  );
  const desaRows = await dbSelect(`SELECT kode_desa_adat FROM desa_adat LIMIT 1`);
  const kodeRaw = String(desaRows[0]?.kode_desa_adat ?? "").replace(/\D/g, "");
  const kodeDesa = (kodeRaw.length >= 4 ? kodeRaw.slice(0, 4) : kodeRaw.padStart(4, "0")) || "0000";
  const allTim = await dbSelect(
    `SELECT id, nomor_pengenal FROM tim_kasukretan ORDER BY created_at ASC, nama ASC`
  );
  let maxUrut = 0;
  for (const r of allTim) {
    const digits = String(r.nomor_pengenal ?? "").replace(/\D/g, "");
    if (!digits) continue;
    const urut = Number.parseInt(digits.length >= 7 ? digits.slice(-3) : digits.slice(-3), 10);
    if (Number.isFinite(urut) && urut > maxUrut) maxUrut = urut;
  }
  for (const row of allTim) {
    const digits = String(row.nomor_pengenal ?? "").replace(/\D/g, "");
    const already = digits.length === 7 && digits.slice(0, 4) === kodeDesa;
    if (already) continue;
    let urut = digits
      ? Number.parseInt(digits.length >= 7 ? digits.slice(-3) : digits.slice(-3), 10)
      : 0;
    if (!Number.isFinite(urut) || urut <= 0) {
      maxUrut += 1;
      urut = maxUrut;
    } else {
      maxUrut = Math.max(maxUrut, urut);
    }
    const nomor = `${kodeDesa}${String(urut).padStart(3, "0")}`;
    await dbExecute(
      `UPDATE tim_kasukretan SET nomor_pengenal = ?, updated_at = datetime('now') WHERE id = ?`,
      [nomor, row.id]
    );
  }
  await dbExecute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tim_kasukretan_nomor_pengenal
     ON tim_kasukretan (nomor_pengenal)`
  );

  // Halaman publik cek tunggakan Paturunan (default off)
  await ensureColumn("desa_adat", "cek_tunggakan_paturunan_publik", "INTEGER NOT NULL DEFAULT 0");

  // Pencarian cepat nomor kartu
  await ensureColumn("krama", "nomor_kartu_norm", "TEXT");
  const staleNorm = await dbSelect(
    `SELECT 1 AS x FROM krama
     WHERE nomor_kartu_norm IS NULL OR nomor_kartu_norm = ''
        OR nomor_kartu_norm <> lower(replace(nomor_kartu, '-', ''))
     LIMIT 1`
  );
  if (staleNorm.length > 0) {
    await dbExecute(
      `UPDATE krama SET nomor_kartu_norm = lower(replace(nomor_kartu, '-', ''))
       WHERE nomor_kartu_norm IS NULL OR nomor_kartu_norm = ''
          OR nomor_kartu_norm <> lower(replace(nomor_kartu, '-', ''))`
    );
  }
  await dbExecute(
    `CREATE INDEX IF NOT EXISTS idx_krama_nomor_kartu_norm ON krama (nomor_kartu_norm)`
  );
  await dbExecute(
    `CREATE INDEX IF NOT EXISTS idx_krama_status_banjar ON krama (status_krama, banjar_id)`
  );
  await dbExecute(
    `CREATE INDEX IF NOT EXISTS idx_krama_kepala ON krama (kepala_penduduk_id)`
  );

  // Akun PIN portal krama (login /portal)
  await dbExecute(
    `CREATE TABLE IF NOT EXISTS krama_portal (
      krama_id TEXT PRIMARY KEY REFERENCES krama(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      aktif INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
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
