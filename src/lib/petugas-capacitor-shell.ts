import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

let started = false;

function isPetugasHomePath(path: string): boolean {
  return path === "/login" || path === "/pengumpulan" || path === "/pengumpulan/";
}

/**
 * Inisialisasi shell Capacitor untuk HP petugas:
 * tombol kembali Android = history.back; keluar app di login / beranda pengumpulan.
 */
export function startPetugasCapacitorShell(): () => void {
  if (started || !Capacitor.isNativePlatform()) {
    return () => {};
  }
  started = true;

  const sub = App.addListener("backButton", ({ canGoBack }) => {
    const path = window.location.pathname;
    if (isPetugasHomePath(path)) {
      void App.exitApp();
      return;
    }
    if (canGoBack || window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/pengumpulan");
  });

  return () => {
    started = false;
    void sub.then((h) => h.remove());
  };
}
