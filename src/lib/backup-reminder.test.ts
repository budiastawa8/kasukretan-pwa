import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_REMINDER_SNOOZE_DAYS,
  markBackupCompleted,
  monthKey,
  readBackupReminderState,
  shouldShowBackupReminder,
  snoozeBackupReminder,
} from "./backup-reminder";

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
}

describe("backup-reminder", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("menampilkan pengingat bila belum backup bulan ini", () => {
    expect(shouldShowBackupReminder(new Date(2026, 9, 18))).toBe(true);
  });

  it("menyembunyikan pengingat setelah backup bulan berjalan", () => {
    markBackupCompleted(new Date(2026, 9, 5));
    expect(shouldShowBackupReminder(new Date(2026, 9, 18))).toBe(false);
    expect(readBackupReminderState().lastBackupMonth).toBe("2026-10");
  });

  it("muncul lagi di bulan berikutnya", () => {
    markBackupCompleted(new Date(2026, 9, 20));
    expect(shouldShowBackupReminder(new Date(2026, 10, 1))).toBe(true);
  });

  it(`menunda ${BACKUP_REMINDER_SNOOZE_DAYS} hari setelah Nanti`, () => {
    const clicked = new Date(2026, 9, 18);
    snoozeBackupReminder(clicked);
    expect(readBackupReminderState().snoozeUntil).toBe("2026-10-21");
    expect(shouldShowBackupReminder(new Date(2026, 9, 18))).toBe(false);
    expect(shouldShowBackupReminder(new Date(2026, 9, 20))).toBe(false);
    expect(shouldShowBackupReminder(new Date(2026, 9, 21))).toBe(true);
  });

  it("monthKey memakai bulan kalender lokal", () => {
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
    expect(monthKey(new Date(2026, 11, 31))).toBe("2026-12");
  });
});
