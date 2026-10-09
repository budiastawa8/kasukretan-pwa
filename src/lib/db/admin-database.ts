import { invoke } from "../desktop/core";
import { closeDb, getDb } from "./client";
import { seedDatabase, seedDatabaseAfterWipe } from "./seed";
import { seedVideoDemoContent } from "./seed-video-demo";
import { clearCloudSession } from "../sync/cloud-config";
import { readPendingPaymentDeletions } from "../sync/payment-deletions";
import { setSyncMeta } from "../sync/sync-meta";
import { isDesktopApp } from "../runtime";
import { today } from "../utils";

function assertDesktop(): void {
  if (!isDesktopApp()) {
    throw new Error("Operasi database hanya tersedia di aplikasi desktop.");
  }
}

/** Kosongkan semua tabel via Rust (FK off, satu koneksi). Wajib tutup plugin-sql dulu. */
async function wipeDesktopDatabaseData(): Promise<void> {
  await closeDb();
  await invoke("sqlite_wipe_all_data");
}

const SQLITE_MAGIC = "SQLite format 3";

function escapeSqlitePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/'/g, "''");
}

async function checkpointDatabase(): Promise<void> {
  const db = await getDb();
  await db.execute(`PRAGMA wal_checkpoint(FULL)`);
}

async function assertSqliteBackupFile(path: string): Promise<void> {
  const { readFile } = await import("../desktop/fs");
  const bytes = await readFile(path);
  const head = new TextDecoder().decode(bytes.slice(0, 15));
  if (!head.startsWith(SQLITE_MAGIC)) {
    throw new Error("File bukan database SQLite Kasukretan yang valid.");
  }
}

function clearLocalSession(): void {
  clearCloudSession();
  localStorage.removeItem("kasukretan_user");
}

function reloadToLogin(): void {
  window.location.href = "/login";
}

/** Salin database ke path berkas .db (tanpa dialog). Menimpa file yang sudah ada. */
export async function backupDesktopDatabaseToFile(destPath: string): Promise<string> {
  assertDesktop();
  await checkpointDatabase();

  const tmpPath = `${destPath}.tmp`;
  await invoke("remove_file_if_exists", { path: tmpPath });

  const db = await getDb();
  const escaped = escapeSqlitePath(tmpPath);
  await db.execute(`VACUUM INTO '${escaped}'`);

  await invoke("atomic_replace_file", { src: tmpPath, dest: destPath });
  return destPath;
}

/** Buat salinan database ke berkas .db pilihan pengguna. */
export async function backupDesktopDatabase(): Promise<string> {
  assertDesktop();
  const { save } = await import("../desktop/dialog");

  await checkpointDatabase();

  const dest = await save({
    defaultPath: `kasukretan-backup-${today()}.db`,
    filters: [{ name: "Database SQLite", extensions: ["db", "sqlite"] }],
  });
  if (!dest || Array.isArray(dest)) {
    throw new Error("Backup dibatalkan.");
  }

  return backupDesktopDatabaseToFile(String(dest));
}

/** Ganti database aktif dengan berkas backup, lalu muat ulang aplikasi. */
export async function restoreDesktopDatabase(): Promise<void> {
  assertDesktop();
  const { open } = await import("../desktop/dialog");

  const picked = await open({
    multiple: false,
    filters: [{ name: "Database SQLite", extensions: ["db", "sqlite"] }],
  });
  if (!picked || Array.isArray(picked)) {
    throw new Error("Restore dibatalkan.");
  }

  await assertSqliteBackupFile(picked);
  await closeDb();

  const dest = await invoke<string>("database_file_path");
  await invoke("replace_database_file", { src: picked, dest });

  clearLocalSession();
  reloadToLogin();
}

/** Hapus semua baris pembayaran dudukan (siap impor ulang). */
export async function clearAllDudukanPembayaran(): Promise<{ deleted: number }> {
  assertDesktop();
  const db = await getDb();
  const countRows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM dudukan_pembayaran`
  );
  const deleted = Number(countRows[0]?.c ?? 0);

  await db.execute(`DELETE FROM dudukan_pembayaran`);

  const pending = await readPendingPaymentDeletions();
  await setSyncMeta(
    "pending_payment_deletions",
    JSON.stringify({ paturunan: pending.paturunan, dudukan: [] })
  );

  return { deleted };
}

/** Hapus semua baris pembayaran paturunan (siap impor ulang). */
export async function clearAllPaturunanPembayaran(): Promise<{ deleted: number }> {
  assertDesktop();
  const db = await getDb();
  const countRows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM paturunan_pembayaran`
  );
  const deleted = Number(countRows[0]?.c ?? 0);

  await db.execute(`DELETE FROM paturunan_pembayaran`);
  await db.execute(`DELETE FROM paturunan_lunas_krama`);

  const pending = await readPendingPaymentDeletions();
  await setSyncMeta(
    "pending_payment_deletions",
    JSON.stringify({ paturunan: [], dudukan: pending.dudukan })
  );

  return { deleted };
}

/** Hapus semua data transaksional & master, lalu seed minimal (admin + klasifikasi). */
export async function clearDesktopDatabase(): Promise<void> {
  assertDesktop();
  await wipeDesktopDatabaseData();
  await seedDatabase();
  clearLocalSession();
  reloadToLogin();
}

/**
 * Kosongkan database lalu isi data fiktif untuk rekaman video promosi.
 * Semua nama/NIK contoh — bukan data warga nyata.
 */
export async function loadVideoDemoDatabase(): Promise<void> {
  assertDesktop();
  await wipeDesktopDatabaseData();
  const db = await getDb();
  await seedDatabaseAfterWipe(db);
  await seedVideoDemoContent(db);
  clearLocalSession();
  reloadToLogin();
}
