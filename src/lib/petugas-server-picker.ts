import { Capacitor } from "@capacitor/core";

/** True di shell Capacitor APK petugas (bukan browser biasa). */
export function isPetugasNativeShell(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Kembali ke pemilih server lokal di APK (`www/index.html`).
 * Capacitor Android menyajikan aset lokal di https://localhost.
 */
export function openPetugasServerPicker(): void {
  if (!isPetugasNativeShell()) return;
  // ?pick=1 mencegah auto-redirect ke server aktif
  window.location.assign("https://localhost/?pick=1");
}
