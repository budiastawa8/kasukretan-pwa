import { getCloudApiToken } from "./cloud-config";
import { pushPortalToCloud } from "./portal-sync";
import { formatSyncError, notifyCloudSync } from "./sync-notify";

/** Kirim akun portal ke cloud; gagal diam-diam agar tidak mengganggu simpan PIN lokal. */
export async function tryAutoPushPortal(): Promise<{
  ok: boolean;
  upserted?: number;
  errors?: string[];
  message?: string;
}> {
  if (!getCloudApiToken()) {
    return { ok: false, message: "Belum login API cloud" };
  }
  try {
    const r = await pushPortalToCloud();
    if (r.result.errors.length > 0) {
      notifyCloudSync({
        kind: "error",
        message: r.result.errors.slice(0, 3).join(" · "),
        source: "Auto-push portal",
      });
    }
    return {
      ok: r.result.errors.length === 0,
      upserted: r.result.upserted,
      errors: r.result.errors,
    };
  } catch (e) {
    const message = formatSyncError(e);
    console.warn("[sync] auto-push portal gagal:", message);
    notifyCloudSync({
      kind: "error",
      message,
      source: "Auto-push portal",
    });
    return { ok: false, message };
  }
}
