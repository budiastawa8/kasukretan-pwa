import { useEffect, useRef } from "react";
import { runCloseBackup } from "../lib/auto-backup";
import { isDesktopApp } from "../lib/runtime";

const BACKUP_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("Backup timeout")), ms);
    promise.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      }
    );
  });
}

/**
 * Saat jendela ditutup: jalankan backup dulu, lalu tutup aplikasi.
 * Progress UI dikirim lewat event (lihat CloseBackupOverlay).
 */
export function useCloseBackupOnExit(): void {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!isDesktopApp()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("../lib/desktop/window");
        if (cancelled) return;
        const win = await getCurrentWindow();

        unlisten = await win.onCloseRequested(async (event) => {
          event.preventDefault();

          // Klik tutup kedua saat backup macet → paksa tutup.
          if (runningRef.current) {
            try {
              unlisten?.();
              await win.destroy();
            } catch (e) {
              console.error("Force destroy failed:", e);
            }
            return;
          }

          runningRef.current = true;
          try {
            await withTimeout(runCloseBackup(), BACKUP_TIMEOUT_MS);
          } catch (e) {
            console.error("Close backup failed:", e);
          }

          try {
            unlisten?.();
            unlisten = undefined;
            await win.destroy();
          } catch (e) {
            console.error("Window destroy failed:", e);
            runningRef.current = false;
          }
        });
      } catch (e) {
        console.error("Failed to register close-backup handler:", e);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
