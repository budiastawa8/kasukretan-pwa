import { isDesktopApp } from "../runtime";
import { getCloudApiToken } from "./cloud-config";
import { readPendingKeringananDeletions } from "./keringanan-deletions";
import { pushKeringananByIds, pushKeringananDeletions } from "./keringanan-sync";
import { formatSyncError, notifyCloudSync } from "./sync-notify";

/** Kirim keringanan baru ke cloud jika desktop sudah login API (non-blocking). */
export async function tryAutoPushKeringanan(ids: string[]): Promise<void> {
  if (!isDesktopApp() || !getCloudApiToken()) return;
  const trimmed = ids.map((id) => id.trim()).filter(Boolean);
  if (trimmed.length === 0) return;
  try {
    const result = await pushKeringananByIds(trimmed);
    if (result.errors.length > 0) {
      notifyCloudSync({
        kind: "error",
        message: result.errors.slice(0, 3).join(" · "),
        source: "Auto-push keringanan",
      });
    }
  } catch (e) {
    console.warn("[sync] auto-push keringanan gagal:", e);
    notifyCloudSync({
      kind: "error",
      message: formatSyncError(e),
      source: "Auto-push keringanan",
    });
  }
}

/** Hapus keringanan di cloud setelah dihapus di desktop (non-blocking). */
export async function tryAutoPushKeringananDeletions(): Promise<void> {
  if (!isDesktopApp() || !getCloudApiToken()) return;
  const pending = await readPendingKeringananDeletions();
  if (pending.length === 0) return;
  try {
    const result = await pushKeringananDeletions(pending);
    if (result.errors.length > 0) {
      notifyCloudSync({
        kind: "error",
        message: result.errors.slice(0, 3).join(" · "),
        source: "Auto-push hapus keringanan",
      });
    }
  } catch (e) {
    console.warn("[sync] auto-push hapus keringanan gagal:", e);
    notifyCloudSync({
      kind: "error",
      message: formatSyncError(e),
      source: "Auto-push hapus keringanan",
    });
  }
}
