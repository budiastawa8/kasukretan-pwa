import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

let started = false;

/**
 * Inisialisasi shell Capacitor untuk mode petugas:
 * tombol kembali Android = history.back di dalam /petugas, keluar app di root.
 */
export function startPetugasCapacitorShell(): () => void {
  if (started || !Capacitor.isNativePlatform()) {
    return () => {};
  }
  started = true;

  const sub = App.addListener("backButton", ({ canGoBack }) => {
    const path = window.location.pathname;
    const inPetugas = path === "/petugas" || path.startsWith("/petugas/");
    if (!inPetugas) {
      if (canGoBack) window.history.back();
      else void App.exitApp();
      return;
    }
    if (path === "/petugas" || path === "/petugas/") {
      void App.exitApp();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/petugas");
  });

  return () => {
    started = false;
    void sub.then((h) => h.remove());
  };
}
