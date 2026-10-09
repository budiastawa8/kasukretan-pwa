/** Buka URL di browser sistem (Electron shell.openExternal). */

import { getElectronApi } from "../electron-bridge";

export async function openUrl(url: string): Promise<void> {
  const api = getElectronApi();
  if (api?.opener?.openUrl) {
    await api.opener.openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
