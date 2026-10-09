import { invoke } from "./desktop/core";
import { backupDesktopDatabaseToFile } from "./db/admin-database";
import { getDesaAdat } from "./services/desa";
import { isDesktopApp } from "./runtime";

const STORAGE_KEY = "kasukretan.auto_backup.v1";
export const AUTO_BACKUP_UPDATED_EVENT = "kasukretan:auto-backup-updated";
export const CLOSE_BACKUP_UI_EVENT = "kasukretan:close-backup-ui";

export type AutoBackupConfig = {
  /** Backup saat aplikasi ditutup. */
  enabled: boolean;
  /** Kosong = folder default Dokumen/Kasukretan/Backup. */
  folderPath: string;
  lastBackupPath: string | null;
  lastError: string | null;
  lastRunAt: string | null;
};

export type CloseBackupUiDetail = {
  visible: boolean;
  /** 0–100; null = indeterminate */
  progress: number | null;
  label: string;
};

const DEFAULT_CONFIG: AutoBackupConfig = {
  enabled: true,
  folderPath: "",
  lastBackupPath: null,
  lastError: null,
  lastRunAt: null,
};

let backupBusy = false;

function notifyUpdated(): void {
  window.dispatchEvent(new Event(AUTO_BACKUP_UPDATED_EVENT));
}

export function emitCloseBackupUi(detail: CloseBackupUiDetail): void {
  window.dispatchEvent(new CustomEvent(CLOSE_BACKUP_UI_EVENT, { detail }));
}

export function readAutoBackupConfig(): AutoBackupConfig {
  if (typeof localStorage === "undefined") return { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AutoBackupConfig> & {
      /** Legacy field — diabaikan. */
      scheduleTime?: string;
      lastBackupDate?: string | null;
    };
    return {
      ...DEFAULT_CONFIG,
      enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : DEFAULT_CONFIG.enabled,
      folderPath: typeof parsed.folderPath === "string" ? parsed.folderPath : "",
      lastBackupPath: typeof parsed.lastBackupPath === "string" ? parsed.lastBackupPath : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      lastRunAt: typeof parsed.lastRunAt === "string" ? parsed.lastRunAt : null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeAutoBackupConfig(patch: Partial<AutoBackupConfig>): AutoBackupConfig {
  const next = { ...readAutoBackupConfig(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notifyUpdated();
  return next;
}

/** Kode desa aman untuk nama berkas; fallback jika belum diatur. */
export function sanitizeDesaKodeForFilename(kode: string | null | undefined): string {
  const cleaned = (kode ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned || "unknown";
}

export function autoBackupFileName(kodeDesa: string | null | undefined): string {
  return `kasukretan-${sanitizeDesaKodeForFilename(kodeDesa)}.db`;
}

export function joinBackupPath(folderPath: string, fileName: string): string {
  const base = folderPath.trim().replace(/[\\/]+$/, "");
  const sep = base.includes("\\") ? "\\" : "/";
  return `${base}${sep}${fileName}`;
}

/** Folder default: Dokumen/Kasukretan/Backup (dibuat jika belum ada). */
export async function resolveDefaultBackupFolder(): Promise<string> {
  return invoke<string>("ensure_auto_backup_dir");
}

export async function resolveBackupFolder(config = readAutoBackupConfig()): Promise<string> {
  const custom = config.folderPath.trim();
  if (custom) {
    await invoke("ensure_directory", { path: custom });
    return custom;
  }
  return resolveDefaultBackupFolder();
}

export type AutoBackupRunResult =
  | { status: "skipped"; reason?: string }
  | { status: "busy" }
  | { status: "ok"; path: string }
  | { status: "error"; message: string };

const PROGRESS_SHOW_DELAY_MS = 450;

/**
 * Backup database ke `kasukretan-{kode_desa}.db` (menimpa file yang sama).
 * Dipakai saat aplikasi ditutup.
 */
export async function runCloseBackup(options?: {
  /** Paksa jalan meskipun toggle dimatikan (untuk uji). */
  force?: boolean;
}): Promise<AutoBackupRunResult> {
  if (!isDesktopApp()) return { status: "skipped", reason: "bukan-desktop" };

  const config = readAutoBackupConfig();
  if (!options?.force && !config.enabled) {
    return { status: "skipped", reason: "nonaktif" };
  }
  if (backupBusy) return { status: "busy" };

  backupBusy = true;
  const now = new Date();
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let shown = false;
  let fakePct = 8;

  const showProgressSoon = () => {
    progressTimer = setTimeout(() => {
      shown = true;
      emitCloseBackupUi({
        visible: true,
        progress: fakePct,
        label: "Menyimpan backup database…",
      });
      tickTimer = setInterval(() => {
        fakePct = Math.min(90, fakePct + 3 + Math.floor(Math.random() * 4));
        emitCloseBackupUi({
          visible: true,
          progress: fakePct,
          label: "Menyalin database…",
        });
      }, 280);
    }, PROGRESS_SHOW_DELAY_MS);
  };

  const hideProgress = () => {
    if (progressTimer) clearTimeout(progressTimer);
    if (tickTimer) clearInterval(tickTimer);
    if (shown) {
      emitCloseBackupUi({ visible: false, progress: null, label: "" });
    }
  };

  try {
    showProgressSoon();

    const desa = await getDesaAdat().catch(() => null);
    const fileName = autoBackupFileName(desa?.kode_desa_adat);
    const folder = await resolveBackupFolder(config);
    const dest = joinBackupPath(folder, fileName);

    const path = await backupDesktopDatabaseToFile(dest);

    if (shown) {
      emitCloseBackupUi({
        visible: true,
        progress: 100,
        label: "Backup selesai",
      });
      await new Promise((r) => setTimeout(r, 180));
    }

    writeAutoBackupConfig({
      lastBackupPath: path,
      lastError: null,
      lastRunAt: now.toISOString(),
    });
    return { status: "ok", path };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    writeAutoBackupConfig({
      lastError: message,
      lastRunAt: now.toISOString(),
    });
    return { status: "error", message };
  } finally {
    hideProgress();
    backupBusy = false;
  }
}

/** @deprecated Gunakan runCloseBackup — tetap diekspor agar import lama tidak putus. */
export async function runAutoBackupIfDue(): Promise<AutoBackupRunResult> {
  return { status: "skipped", reason: "diganti-close-backup" };
}

export async function pickAutoBackupFolder(): Promise<string | null> {
  const { open } = await import("./desktop/dialog");
  const picked = await open({
    directory: true,
    multiple: false,
    title: "Pilih folder backup otomatis",
  });
  if (!picked || Array.isArray(picked)) return null;
  return String(picked);
}
