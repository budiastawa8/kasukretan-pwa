/** Dialog native Electron (buka / simpan berkas). */

import { getElectronApi } from "../electron-bridge";

function requireDialog() {
  const api = getElectronApi();
  if (!api?.dialog) {
    throw new Error("Dialog file hanya tersedia di aplikasi desktop Electron.");
  }
  return api.dialog;
}

export async function open(
  options?: Record<string, unknown>
): Promise<string | string[] | null> {
  return requireDialog().open(options);
}

export async function save(
  options?: Record<string, unknown>
): Promise<string | null> {
  return requireDialog().save(options);
}
