/**
 * Pengingat backup bulanan untuk admin (PWA/cloud).
 * - Muncul bila belum backup di bulan kalender berjalan.
 * - "Nanti" menunda 3 hari, lalu muncul lagi.
 * - Setelah unduh backup sukses, disembunyikan sampai bulan berikutnya.
 */

import { pad2 } from "./utils";

const STORAGE_KEY = "kasukretan.backup_reminder.v1";
export const BACKUP_REMINDER_UPDATED_EVENT = "kasukretan:backup-reminder-updated";

/** Hari penundaan setelah admin memilih "Nanti". */
export const BACKUP_REMINDER_SNOOZE_DAYS = 3;

export type BackupReminderState = {
  /** Bulan YYYY-MM saat backup terakhir dicatat selesai. */
  lastBackupMonth: string | null;
  /** Tanggal YYYY-MM-DD: banner boleh muncul lagi mulai hari ini (inklusif). */
  snoozeUntil: string | null;
};

const DEFAULT_STATE: BackupReminderState = {
  lastBackupMonth: null,
  snoozeUntil: null,
};

function notifyUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BACKUP_REMINDER_UPDATED_EVENT));
}

export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function dateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function readBackupReminderState(): BackupReminderState {
  if (typeof localStorage === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<BackupReminderState>;
    return {
      lastBackupMonth:
        typeof parsed.lastBackupMonth === "string" ? parsed.lastBackupMonth : null,
      snoozeUntil: typeof parsed.snoozeUntil === "string" ? parsed.snoozeUntil : null,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeBackupReminderState(patch: Partial<BackupReminderState>): BackupReminderState {
  const next = { ...readBackupReminderState(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notifyUpdated();
  return next;
}

/** True bila admin perlu melihat pengingat backup bulanan. */
export function shouldShowBackupReminder(now: Date = new Date()): boolean {
  const state = readBackupReminderState();
  const month = monthKey(now);
  if (state.lastBackupMonth === month) return false;
  const today = dateKey(now);
  if (state.snoozeUntil && today < state.snoozeUntil) return false;
  return true;
}

/** Catat backup berhasil untuk bulan berjalan; hapus snooze. */
export function markBackupCompleted(now: Date = new Date()): BackupReminderState {
  return writeBackupReminderState({
    lastBackupMonth: monthKey(now),
    snoozeUntil: null,
  });
}

/** Tunda pengingat selama {@link BACKUP_REMINDER_SNOOZE_DAYS} hari. */
export function snoozeBackupReminder(now: Date = new Date()): BackupReminderState {
  const until = addDays(now, BACKUP_REMINDER_SNOOZE_DAYS);
  return writeBackupReminderState({ snoozeUntil: dateKey(until) });
}
