import { isDesktopApp } from "../runtime";
import { getCloudApiToken } from "./cloud-config";
import { readPendingPaymentDeletions } from "./payment-deletions";
import { pushPembayaranByIds, pushPaymentDeletions } from "./payment-sync";
import { formatSyncError, notifyCloudSync } from "./sync-notify";

function pushErrorCount(result: {
  paturunan: { errors: string[] };
  dudukan: { errors: string[] };
  keringanan: { errors: string[] };
}): number {
  return (
    result.paturunan.errors.length +
    result.dudukan.errors.length +
    result.keringanan.errors.length
  );
}

function notifyPushErrors(
  result: {
    paturunan: { errors: string[] };
    dudukan: { errors: string[] };
    keringanan: { errors: string[] };
  },
  source: string
): void {
  const errors = [
    ...result.paturunan.errors,
    ...result.dudukan.errors,
    ...result.keringanan.errors,
  ];
  if (errors.length === 0) return;
  notifyCloudSync({
    kind: "error",
    message: errors.slice(0, 3).join(" · "),
    source,
  });
}

/** Kirim pembayaran baru ke cloud jika desktop sudah login API (non-blocking). */
export async function tryAutoPushPayments(ids: {
  paturunanIds?: string[];
  dudukanIds?: string[];
}): Promise<void> {
  if (!isDesktopApp() || !getCloudApiToken()) return;
  const hasPaturunan = (ids.paturunanIds?.length ?? 0) > 0;
  const hasDudukan = (ids.dudukanIds?.length ?? 0) > 0;
  if (!hasPaturunan && !hasDudukan) return;

  try {
    const result = await pushPembayaranByIds(ids);
    const errCount = pushErrorCount(result);
    if (errCount > 0) {
      notifyPushErrors(result, "Auto-push pembayaran");
    } else {
      const inserted =
        result.paturunan.inserted + result.dudukan.inserted + result.keringanan.inserted;
      if (inserted > 0) {
        notifyCloudSync({
          kind: "success",
          message: "Pembayaran terkirim ke cloud.",
          source: "Auto-push pembayaran",
        });
      }
    }
  } catch (e) {
    console.warn("[sync] auto-push pembayaran gagal:", e);
    notifyCloudSync({
      kind: "error",
      message: formatSyncError(e),
      source: "Auto-push pembayaran",
    });
  }
}

/** Hapus di cloud jika pembayaran dihapus di desktop (non-blocking). */
export async function tryAutoPushPaymentDeletions(): Promise<void> {
  if (!isDesktopApp() || !getCloudApiToken()) return;
  const pending = await readPendingPaymentDeletions();
  if (pending.paturunan.length === 0 && pending.dudukan.length === 0) return;
  try {
    const result = await pushPaymentDeletions(pending);
    if (pushErrorCount(result) > 0) {
      notifyPushErrors(result, "Auto-push hapus pembayaran");
    }
  } catch (e) {
    console.warn("[sync] auto-push hapus pembayaran gagal:", e);
    notifyCloudSync({
      kind: "error",
      message: formatSyncError(e),
      source: "Auto-push hapus pembayaran",
    });
  }
}
