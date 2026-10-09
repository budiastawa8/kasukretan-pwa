/** Window API: close-requested + destroy (backup saat tutup). */

import { getElectronApi } from "../electron-bridge";

export async function getCurrentWindow() {
  const api = getElectronApi();
  if (!api?.window) {
    return {
      async onCloseRequested(
        _cb: (event: { preventDefault: () => void }) => void
      ) {
        return () => undefined;
      },
      async destroy() {
        /* no-op outside Electron */
      },
    };
  }

  return {
    async onCloseRequested(
      cb: (event: { preventDefault: () => void }) => void | Promise<void>
    ) {
      return api.window.onCloseRequested(cb);
    },
    async destroy() {
      await api.window.destroy();
    },
  };
}
