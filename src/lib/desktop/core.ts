/**
 * Desktop Electron core: deteksi shell + invoke perintah main process.
 */

import { getElectronApi, isElectronShell } from "../electron-bridge";

/** True jika berjalan di shell Electron (bukan browser murni). */
export function isDesktopShell(): boolean {
  return isElectronShell();
}

/** @deprecated Gunakan isDesktopShell — nama lama untuk kompatibilitas singkat. */
export function isTauri(): boolean {
  return isDesktopShell();
}

export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const api = getElectronApi();
  if (!api?.invoke) {
    throw new Error(
      `invoke("${cmd}") hanya tersedia di aplikasi desktop Electron.`
    );
  }
  return (await api.invoke(cmd, args)) as T;
}
