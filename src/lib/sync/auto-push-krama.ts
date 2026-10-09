import { isDesktopApp } from "../runtime";
import { getCloudApiToken } from "./cloud-config";
import { pushKramaByIds } from "./krama-sync";
import { formatSyncError, notifyCloudSync } from "./sync-notify";

/** Kirim satu krama ke cloud jika desktop sudah login API (non-blocking). */
export async function tryAutoPushKrama(kramaId: string): Promise<void> {
  if (!isDesktopApp() || !getCloudApiToken()) return;
  const id = kramaId.trim();
  if (!id) return;

  try {
    const res = await pushKramaByIds([id]);
    if (res.empty) return;

    const errN = res.result.errors.length;
    if (errN > 0) {
      notifyCloudSync({
        kind: "error",
        message: res.result.errors.slice(0, 3).join(" · "),
        source: "Auto-push krama",
      });
      return;
    }

    if (res.result.krama > 0) {
      notifyCloudSync({
        kind: "success",
        message: `Krama terkirim ke cloud (${res.result.krama} kartu).`,
        source: "Auto-push krama",
      });
    }
  } catch (e) {
    console.warn("[sync] auto-push krama gagal:", e);
    notifyCloudSync({
      kind: "error",
      message: formatSyncError(e),
      source: "Auto-push krama",
    });
  }
}
